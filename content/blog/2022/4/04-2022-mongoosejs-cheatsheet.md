---
title: 2022 MongooseJS Cheatsheet
date: "2022-04-19"
description: "Details on working with MongooseJS"
author: "Alex Merced"
category: "database"
bannerImage: "/images/postbanner/2022/batch-streaming.png"
tags:
  - backend
  - javascript
  - node
  - database
---

## What is Mongoose?

Mongoose is an ODM (Object Document Manager) that like relational ORMs (Object Relationship Managers) maps the data in our data base to objects for more familiar programming patterns. Mongoose specifically is a MongoDB ODM for Javascript applications, and this article aims to be a resources for working with MongoDB in JS using Mongoose.

- Install mongoose `npm install mongoose`

* We will share many examples in the context of ExpressJS application although the logic and flow should be the same with any other Node web framework like Koa or Fastify.

[MongoDB Video Playlist](Working with MongoDB)

## The Mongoose URI

URI stands for Universal Resource Identifier, a string that allows applications to send messages to other applications. We use HTTP URIs all the time in the form of the URLs to our favorite website. The pattern is as follows:

`protocol://username:password@host:port/resource?query=string&key=value`

- `protocol://` the type of message being sent such as `https://`, `mongodb://`, `postgresql://`

- `username:password@` the username and password if one is needed for the target, typically needed for databases since most web pages are open to the public.

- `host` this would be the domain and subdomains with it that are an alias for an IP address of server that hosts the destination application (`localhost` for example is an alias for `127.0.0.1` which is the machine your currently using.

- `port` every server can receive message on different ports numbered up to 65535 (the highest unsigned 16-bit integer). You generally don't type a port for URLs because browsers know `http` traffic goes to port 80 and `https` traffic goes to port 443. Most databases have a default port they run on `mongodb -> 27017 | postgresql -> 5432 | mysql -> 3306`

- `/resource` tell the receiving application what resources to access at the destination. For web applications this usually a particular web page, file, or JSON data. For database application this usually refers to the particular database being accessed.

- `?query=string&key=value` this is the query string which can be used to pass additional info like data from a form or database configurations.

A MongoDB URI for a mongo server running on my pc would be:

`mongodb://username:password@127.0.0.1:27017/database_name`

[Read here for options that can be passed in the query string](https://www.mongodb.com/docs/manual/reference/connection-string/#connection-string-options)

*The mongodb uri should NEVER be hardcoded in your application but delivered via environmental variables or via some file that is included in your .gitignore so you don't export your URL in any remote public get repositories*

## Importing Mongoose

By default node using commonJS so importing a library would be done using `require`.
`const mongoose = require("mongoose")`

If you add `"type":"module"` to your package.json then your project will be treated like an ES Module and you can then do the following instead.
`import mongoose from "mongoose"`

## Establising a Connection
For our purposes we will assume the mongo uri is stored in a variable called `DATABASE_URL` it's up to you to make sure this variable exists and holds the URI string. The `options` variable we are assuming holds a javascript object with any database configuration which can see listed [here](https://mongoosejs.com/docs/connections.html#options).

```js
//establish the connection
mongoose.connect(DATABASE_URL, OPTIONS)

// saving the connection in a variable
const cxn = mongoose.connection

//creating messages when connection changes state
cxn
.on("open", () => console.log("mongoose is connected"))
.on("close", () => console.log("mongoose is disconnected"))
.on("error", (error) => console.log(error))
```
## Models

Models all us save in and retrieve from our mongoose database. To create a model we must first create a schema which defines the shape of the data in the database (the individual properties and their data types). Defining a basic model can be done like so:

```js
// destructure model function and Schema constructor from mongoose
const {model, Schema} = mongoose

// create a schema
const UserSchema = new Schema({
username: {type: String, unique: true, required: true},
password: {type: String, required: true},
age: Number,
email: String
}, {timestamps: true})

// create a model
const User = model("User", UserSchema)
```

[details on the different schema data types and options](https://mongoosejs.com/docs/guide.html)

[details on working with models](https://mongoosejs.com/docs/models.html)

## Using Model Methods

Model objects have many methods for creating, deleting, updating and finding data in the database. Methods can be used in three different ways. We will write these in the context of an express route but would be pretty much the same in any node web framework.

[Methods you models have](https://mongoosejs.com/docs/queries.html)

```js
// callback syntax
app.get("/users", (req, res) => {
  // use the find method to find all users with the specified username
  User.find({username: req.query.username}, (error, results) => {
    // check if there is an error
    if(error){
      res.status(400).json({error})
      return false
    }
    // send results as json
    res.json(results)
  })
})

// .then syntax
app.get("/users", (req, res) => {
  // use the find method and catch errors
  User.find({username: req.query.username})
  .then((results) => res.json(results))
  .catch((error) => res.status(400).json({error})
})

// async/await syntax
app.get("/users", async (req, res) => {
  // use the find method, catch errors
  const results = await User.find({username: req.query.username}).catch((error) => res.status(400).json({error})
  // send results as response
  res.json(results)
})
```

## Handling Related Documents
MongoDB is a document database so it is optimal for handling unrelated data, but mongoose does build in several tools to make implementing related data a lot easier.

#### First Step: The ObjectID Type
To express a relationship we specify a related field as an ObjectID type meaning it expects to strings that represent object ID of data documents in a specified collection.

```js
// destructure model function and Schema constructor from mongoose
const {model, Schema} = mongoose

// create a schema
const UserSchema = new Schema({
username: {type: String, unique: true, required: true},
password: {type: String, required: true},
age: Number,
email: String,
posts: [{type: mongoose.Types.ObjectId, ref: "Post"]
}, {timestamps: true})

const PostSchema = new Schema({
title: String,
body: String,
author: {type: mongoose.types.ObjectId, ref: "User"}
}, {timestamps: true})

// create a model
const User = model("User", UserSchema)
const Post = model("Post", PostSchema)
```

#### Second Step: Associate Records with Each Other


```js
// grab two existing documents from both collection

app.get("/createPost/:userId", async (req, res) => {
  const post = await Post.create(req.body) // create new post
  const user = await User.findById(req.params.userId) // get existing user
  
  // associate post with user
  post.author = user
  post.save()
  
  // associate user with post
  user.posts.push(post)
  user.save()
  
  // send back post as response with author populated
  res.json(await post.populate("author"))

})
```

The [populate](https://mongoosejs.com/docs/populate.html) method allows us to take a field marked as related to another document (the ObjectID type) and fill in the data from that related document that you don't have to manually do another query to get the additional data.

## Additional Topics

- [Validation](https://mongoosejs.com/docs/validation.html)
- [Model Middleware](https://mongoosejs.com/docs/middleware.html)