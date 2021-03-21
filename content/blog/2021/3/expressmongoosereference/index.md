---
title: Ultimate Express & Mongo Reference
date: "2021-03-18T12:12:03.284Z"
description: Building Backends with NodeJS
---

This is not a guide on how to use express and mongo, but a useful reference especially for those starting to learn these technologies. This guide will serve as documentation of the basics of all the main functions and patterns in these libraries.

## Express

- **Installation Command:** `npm install express`
- **Importing:** `const express = require("express")`

#### express()

The express function returns a new application object. The application object has several different functions.

- can register middleware and routes
- can initiate the http listener on a particular port

**Typical use**

```js
// import express
const express = require("express")

// create an application object
const app = express()

// create new router
const router = express.Router()

// register middleware with the application, (each request will run through each of these one by one)
app.set("view engine", "ejs") // specify the view engine for view rendering
app.use(express.static("public")) // serve a folder called "public" as static
app.use(express.json()) // parse json bodies based on Content-Type header
app.use(express.urlencoded({ extended: false })) // parse urlencoded form data
app.use("/", router) // register the router with the application

// register routes with the router
router.get("/path", getHandlerFunction) // invokes function for matching get request
router.post("/path", postHandlerFunction) // invokes function for matching post request
router.put("/path", putHandlerFunction) // invokes function for matching put request
router.delete("/path", deleteHandlerFunction) // invokes function for matching delete request

// Initiate the server listening on a port with a function that runs when server starts listening
app.listen(3000, () => console.log("Listening on Port 3000"))
```

#### The Request and Response Objects

When the listener receives a request two objects are generated, Request and Response (req, res) which is passed to each middleware function & route one by one until a response is sent. These request and response objects have several useful properties.

**REQUEST**

- req.params: an objects with an defined url parameters (defined in router paths using colons... `"/:these/:are/:params"`)

- req.query: an object of any url queries in the request url

- req.headers: an object of all the headers in the request

- req.method: a string detailing the method of the request ("get", "post", etc.)

- req.body: object containing the data from the request, must be parsed by middleware that can parse the type of data sent. (express.json for json data, express.urlencoded for form data)

**RESPONSE**

- res.send("string"): function for sending a text response, will auto-send arrays and objects as json responses. Will send html strings as html responses.

- res.json({data}): send a json response

- res.render("template", {data}): tells view engine to render the specified template in the views folder with the data in the second argument. The resulting HTML file is sent as a response.

- res.set("header-name","header-value"): function for setting a response header

- res.redirect("/path"): redirect the browser to a different path

#### Popular 3rd Party Middleware

- `npm install cors` : middleware for setting cors headers
- `npm install method-override`: override request methods based on a url query
- `npm install morgan`: request logging
- `npm install express-session`: use session cookies with express
- `npm install connect-mongo`: session cookie store using mongodb

#### Popular View Engines

- EJS
- Handlebars
- Mustache
- Nunjucks
- Pug
- Marko
- Express-React-Views
- Liquid

## Mongoose

ODM (Object Document Mapper/Manager) for Mongo databases. Allows you to connect to mongo databases and create model objects.

- `npm install mongoose`

#### Connecting to Mongo

```js
const mongoose = require("mongoose")

// connect to the database, 1st argument the connection string, 2nd argument a configuration object
mongoose.connect(MongoURI, ConfigObject)

//set responses to database events
mongoose.connection
  .on("open", () => console.log("connected to mongo"))
  .on("close", () => console.log("connected to mongo"))
  .on("error", error => console.log(error))
```

#### Creating a Model Object

```js
const { Schema, model } = require("mongoose")

// create schema
const ModelSchema = new Schema(
  {
    property1: String,
    property2: Number,
    property3: Boolean,
  },
  { timestamps: true }
)

// create model specifying model/collection name and schema
const Model = model("Model", ModelSchema)
```

#### 3 Ways to Write Queries with your model with error handling

```js
// Callback Syntax
Model.find({}, (error, data) => {
  if (error) {
    console.log(error)
  } else {
    console.log(data)
  }
})

// .then syntax
Model.find({})
  .then(data => console.log(data))
  .catch(error => console.log(error))

// using async/await
const queryFunction = async () => {
  try {
    const data = await Model.find({})
    console.log(data)
  } catch (error) {
    console.log(error)
  }
}

queryFunction()
```

#### Model Functions

```js
Model.deleteMany()
Model.deleteOne()
Model.find()
Model.findById()
Model.findByIdAndDelete()
Model.findByIdAndRemove()
Model.findByIdAndUpdate()
Model.findOne()
Model.findOneAndDelete()
Model.findOneAndRemove()
Model.findOneAndReplace()
Model.findOneAndUpdate()
Model.replaceOne()
Model.updateMany()
Model.updateOne()
```

## Further Reading

- [Express Documentation](https://expressjs.com/en/4x/api.html)
- [Mongoose Documentation](https://mongoosejs.com/docs/guides.html)
