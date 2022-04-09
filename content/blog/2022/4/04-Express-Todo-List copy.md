---
title: ExpressJS Cheatsheet 2022
date: "2022-04-09"
description: "Easy reference for using express"
author: "Alex Merced"
category: "javascript"
bannerImage: "/images/postbanner/2022/batch-streaming.png"
tags:
  - backend
  - javascript
  - node
---

This article assumes basic knowledge of ExpressJS, if your new to Express I recommend starting with the following Video Playlist:

- [ExpressJS Video Playlist](https://youtube.com/playlist?list=PLY6oTPmKnKbamIu4uuDJ3QNNDU1SoOkjl)

## Creating a New Project

Assuming you have NodeJS installed just open up your IDE to an empty folder and do the following in terminal:

- Create a new node project `npm init -y`

- install dependencies `npm install express morgan dotenv`

- if you don't have nodemon installed globally, do so `npm install -g nodemon`

- create your initial server file, gitignore and env file `touch server.js .env .gitignore`

- put the following in the .gitignore file

```
.env
/node_modules
```

- put the following in the .env file, this file is for defining variables you don't want in your code and not in public view (api keys, database credentials, sensitive stuff) or variables that should change depending on the context.

```
PORT=5000
```

## package.json

Could of useful things we can do in the package.json:

- We can add scripts, you can add as many as you like but here is basics I'd recommend.

```json
"scripts: {
    "start": "node server.js",
    "dev": "nodemon server.js"
}
```

scripts can be run using the commands `npm run <command name>` for example we can run the dev script with `npm run dev`.

- We can also choose whether we will use commonjs or module syntax, commonjs will be the default if we do nothing, but if we add `"type":"module"` to the package.json then we can use module syntax. This effects how we import and export things.

| Task | CommonJS | ES Module |
|------|----------|-----------|
|Importing Dependency/File| `const something = require("something")` | `import something from "something"`|
|Exporting from a file| `module.exports = something` | `export default something`|

Which you prefer is your own preference, just be aware you may not be able to import JSON files with ES Modules in older versions (or use ES Modules at all in really old versions) of node and use an experimental flag to do so in newer versions.

## Basic Server Setup

CommonJS Version

```js
// bring in environment variables from a .env file
require("dotenv").config()

// import express and morgan
const express = require("express")
const express = require("morgan")

// create an application object
const app = express()

// define a PORT variable from the environment with a default value
const PORT = process.env.PORT || 4000

/////////////////////////////////////
// ALL YOUR MIDDLEWARE AND ROUTES GO HERE
app.use(morgan("tiny")) // middleware for logging
app.use(express.urlencoded({extended: true})) //middleware for parsing urlencoded data
app.use(express.json()) // middleware for parsing incoming json
app.use("/static", express.static("static")) // to set a folder for static file serving
/////////////////////////////////////

// Server Listener
app.listen(PORT, () => console.log(`Listening on port ${PORT}`))
```

ES Module Version

```js
// Bring in environmental variables
import dotenv from "dotenv"
dotenv.config()

// import express and morgan
import express from "express"
import morgan from "morgan"

// create an application object
const app = express()

// define a PORT variable from the environment with a default value
const PORT = process.env.PORT || 4000

/////////////////////////////////////
// ALL YOUR MIDDLEWARE AND ROUTES GO HERE
app.use(morgan("tiny")) // middleware for logging
app.use(express.urlencoded({extended: true})) //middleware for parsing urlencoded data
app.use(express.json()) // middleware for parsing incoming json
app.use("/static", express.static("static")) // to set a folder for static file serving
/////////////////////////////////////

// Server Listener
app.listen(PORT, () => console.log(`Listening on port ${PORT}`))
```

## Middleware

Middleware are just functions that receive three arguments:

- `req` the request object, more on this later
- `res` the response object, more on this later
- `next` a function that passes the req/res objects to the next middleware or route.

Here is an example of the simplest middleware

```js
const middlewareFunction = (req, res, next) => {
 console.log("This is middleware")
}
```

The middleware functions can be registered using the `.use` method of the application object or routers.

```js
// using the middleware on all requests
app.use(middlewareFunction)
// using the middleware on certain urls
app.use("/endpoint", middlewareFunction)
```
Other popular middleware not in the previous code snippets include:

- [CORS](https://www.npmjs.com/package/cors) For setting cors settings for API's
- [Method Override](https://www.npmjs.com/package/method-override) To override the request method on form submissions
- [express-session](https://www.npmjs.com/package/express-session) For setting up session cookies

And many others...

## Routes

Routes determine what is the servers response to in an incoming request. A route is created by using one of the following methods on the application object or a router:

- `.all` for requests of any method
- `.get` for GET requests
- `.post` for POST requests
- `.put` for PUT requests
- `.delete` for DELETE requests

All of these functions take two arguments:

- the endpoint
- a "action", "Controller" or "Route Handler" function that takes `req` and `res` as arguments

Here is an example:

```js
// writing pass an anonymous function
app.get("/endpoint", (req, res) =>  {
  res.send("The Response")
})

// using a named function
function routeHandler(req, res){
  res.send("the response")
}
app.get("/endpoint", routeHandler)
```

## The Request Object (res)
The request object represents the data from the incoming request and is passed to all middleware and route handlers.

-`req.headers` object with the headers of the incoming request
-`req.params` object with any route params
-`req.query` object with any key/values from a url query string
-`req.body` object key/values of the request body (parsed by the express.urlencoded or express.json middleware)
-`req.method` the method of the request as string

plus much more

## The Response Object (res)
The response object is an object that is used to help author the response to the request. Primarily made up of helper functions for different types of responses.

-`res.send` will send a text, html or json request depending on what is passed to it
-`res.json` send a javascript object or array as a json response
-`res.render`renders an html response from a template

## Rendering Templates
Templates allow you to generate html responses dynamically, there are several templating engines that can be used, here are few articles to see how to use them.

- [Intro to Express Templating](https://tuts.alexmercedcoder.com/2021/3/expresstemplatingintro/)
- [Express Templating Cheatsheet](https://tuts.alexmercedcoder.com/2021/10/express_templating_cheatsheet/)

To render a template we use the `res.render` function which takes two arguments:

- the name of the the file to locate in the views folder
- javascript object with data that can be used in the rendering of the template (each templating language should have its own way of using the data from the object in the template)

## Router Objects

You can group routes together using routers which can be used for organization and to apply middleware to a specific group of routes.

Creating a Router

```js
// create the router object
const router = express.Router()
// register it with the application for routes with a certain prefix
app.use("/prefex", router)
```

Just like the application object you can register middlewares routes with the router

```js
// router specific middleware
router.use(middlewareFunction)

// registering routes
router.get("/endpoint", routerHandler) // url is /prefix/endpoint
```

## Connecting to Databases

The following libraries can help you connect to different databases.

- [mongoose](https://www.npmjs.com/package/mongoose) for connecting to a mongo database [mongoose blog](https://tuts.alexmercedcoder.com/2020/ExpressMongo/)
- [sequalize](https://www.npmjs.com/package/sequelize) ORM for SQL databases (postgres, mysql, etc.)
- [objection](https://www.npmjs.com/package/objection) ORM for SQL databases (postgres, mysql, etc.)
- [waterline](https://www.npmjs.com/package/waterline) ORM for SQL databases (postgres, mysql, etc.)

## Making API Calls

Keep in mind you can't use fetch natively in node, and jQuery is only a frontend library. But you have some options.

- [node-fetch](https://www.npmjs.com/package/node-fetch) A library that replicates the browsers fetch function
- [Axios](https://www.npmjs.com/package/axios) A library for making API Calls
- [GOT](https://www.npmjs.com/package/got) a library for making api calls
- [needle](https://www.npmjs.com/package/needle) another http client library