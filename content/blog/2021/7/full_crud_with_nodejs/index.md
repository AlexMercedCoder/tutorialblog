---
title: Basics of Building a CRUD API with NodeJS - Express, Koa and Fastify
date: "2021-07-25T12:12:03.284Z"
description: Learning REST conventions with Javascript
---

NodeJS is an amazing tool that allows us to bring Javascript to backend development. When it comes to creating web servers, there are dozens of frameworks in the Node ecosystem. The most popular minimalist unopinionated frameworks are Express, Koa and Fastify. In this tutorial we will build a basic API that follows RESTful conventions with each one. We will not be using a database but instead an array of objects to simulate data from a database so we can focus on the RESTful patterns. 

## Summary of the RESTful Convention

THe restful convention gives us a blueprint of making the basic routes for CRUD (Create, Read, Update, Delete) functionality in a uniform way. 

API Restful Routes

| Name of Route | Request Method | Endpoint | Result |
|---------------|----------------|----------|--------|
| Index | GET | `/model` | returns list of all items |
| Show | GET | `/model/:id` | returns item with matching id |
| Create | Post | `/model` | creates a new item, returns item or confirmation |
| Update | Put/Patch | `/model/:id` | Updated item with matching ID |
| Destroy | Delete | `/model/:id` | Deletes item with matching ID |

If we weren't build an API but instead rendering pages on the server there would be two additional routes. New, which renders a page with a form to create a new object, submitting the form triggers the create route. Edit, which renders a page with a form to edit an existing object, submitting the form triggers the Update route. 

Since we are building an api, Edit and New aren't necessary as the burden of collecting the information to submit to the Create and Update route will be on whoever builds the applications that consume the API. (Frontend Applications built in frameworks)

Regardless of what database we use, what type of data we are modeling, these conventions don't change giving us an anchor in architecting our API in any languages, framework or context.

## Setup

- Must have NodeJS installed, can be downloaded from nodejs.org

NodeJS is super flexible so we can essentially create all three servers in one project for the sake of time. (In the general for a real project you'd build each of these out in separate projects/folders).

- create a new folder to build the project in and navigate terminal into that folder

- create a package.json file with the command `npm init -y`, this file is essentially what tells NodeJS about your project (what dependencies, scripts, meta data, etc.)

- Let's install the frameworks we will be working with: `npm install express koa koa-router fastify`

#### THINGS TO NOTICE

* a node modules folder is created, this is where the frameworks you installed exist if you wanted to look through their code. Never commit this to github, to avoid this create a `.gitignore` file and inside of add this:

```
/node_modules
```

* A package-lock.json file is created, never touch this file, it just tracks the dependencies of your dependencies to optimize the speed of redownloading them in the future. (If you delete the node modules folder you can easily reinstall everything listed in package.json with the command `npm install`)

* In package.json a new section called dependencies exist listing the name and versions of libraries you've installed. (To uninstall a library the command is `npm uninstall <libraryname>` you can find the directory of libraries at npmjs.com)

#### Creating Our Files

- create the following files in the folder

    - `express-server.js`: file for running our express server

    - `koa-server.js`: file for running our koa server

    - `fastify-server.js`: file for running our fastify server

    - `data.js`: file for our dummy data

    ### Setting Up Our Dummer Data

    To simulate working with a data model as we would with a database and a relationship mapper (a library that maps our database table/collections to classes to make it easier to interact with the database) what we will do is...

    - Build a class that represents our data type "Post" to represent a single blog post
    - Build an array to hold our posts to simular a database collection (documentDB) or table (relationalDB)
    - Note that everytime our server restarts the data will reset to its original state, this is why databases matter so changes can be saved beyond the life of a server instance.

    `data.js`

```js
// Class to Represent a Single Blog Post
class Post {
    // Constructor function for creating new posts
    constructor(title, body){
        this.title = title
        this.body = body
    }
}

// Create an array to hold our posts
const posts = []

// Add a post to our posts array
posts.push(new Post("Title of Post", "Body of Post"))

// Export them to be used in other files
module.exports = {
    Post,
    posts
}
```

Notice this part

```js
// Export them to be used in other files
module.exports = {
    Post,
    posts
}
```

This is how we expose variables to be used in other files in node. In newer versions of node you can add `"type":"module"` to your package.json to use the ES6 module syntax you may have seen in frontend frameworks like React and Vue. If you do that exporting them would look like this.

```js
export Post
export posts
```

or

```js
export default {
    Post
    posts
}
```

### Setting Up Our Scripts

A cool feature in node is we can define scripts in the package.json file. This allows us to define commands that can make longer commands a lot shorter. So in package.json add this:

```json
  "scripts": {
    "express": "node express-server.js",
    "fastify": "node fastify-server.js",
    "koa": "node koa-server.js"
  },
```

This will allow us to run our different servers with the following commands:

- `npm run express` run express server
- `npm run fastify` run fastify server
- `npm run koa` run koa server

This can be really useful if we need to define a bunch of variables in command itself and save us a lot of typing.

### The Index Route

The purpose of the index route is return all the items of a particular model, in our case the entire array of posts. This route is always defined as a GET request to "/model" (in our case "/posts"). After each example run the appropriate server and go to localhost:4000/posts in your browser.

`express-server.js`

```js
// Import Our Data
const {Post, posts} = require("./data")
// Import express
const express = require("express")


//create the express application
const app = express()

//The Index Route
app.get("/posts", (request, response) => {
    // send the posts array as a json response
    response.json(posts)
})

// Turn on the server
app.listen(4000, () => console.log("Server Listening on Port 4000"))
```


`fastify-server.js`

```js
// Import Our Data
const {Post, posts} = require("./data")
// Import fastify
const fastify = require("fastify")

// Create application object
const app = fastify({logger: "true"})

// The Index Route
app.get("/posts", async (request, response) => {
    // the response is the return value which is our posts array
    return posts
})

// run server
app.listen(4000, () => console.log("listening on port 4000"))
```

`koa-server.js`

```js
// Import Our Data
const {Post, posts} = require("./data")
// Import koa
const koa = require("koa")
// import koa router
const koaRouter = require("koa-router")


//create the koa application
const app = new koa()
// create a router for building routes
const router = koaRouter()

// Index Route
// context is a combo of the node request/response objects
router.get("/posts", async (context) => {
    // The response is the value of the context body
    context.body = posts
})

// Register routes
app.use(router.routes())
// Turn on the server
app.listen(4000, () => console.log("Server Listening on Port 4000"))
```

### The Show Route

The show route is about getting back data on a single item. The item is determined via url param (variable part of the URL). While it usually would be a database ID, since we're just using an array the array index will act in place of the database id. Show routes usually are a get request to "/model/:id".

The ":id" part of the path tells the framework that when looking at that part of the url store in a variable called "id". This is usually stored in an object called "params" in the frameworks context or request object. This allows us to pass information to our route via the url.

After each update run the server and go to /posts/0 in the browser!

`express-server.js`

```js
// Import Our Data
const {Post, posts} = require("./data")
// Import express
const express = require("express")


//create the express application
const app = express()

//The Index Route
app.get("/posts", (request, response) => {
    // send the posts array as a json response
    response.json(posts)
})

// The Show Route
app.get("/posts/:id", (request, response) => {
    // get the id from params
    const id = request.params.id
    // return json data
    response.json(posts[id])
})

// Turn on the server
app.listen(4000, () => console.log("Server Listening on Port 4000"))
```

`fastify-server.js`

```js
// Import Our Data
const {Post, posts} = require("./data")
// Import efastify
const fastify = require("fastify")

// Create application object
const app = fastify({logger: "true"})

// The Index Route
app.get("/posts", async (request, response) => {
    // the response is the return value which is our posts array
    return posts
})

// The Show Route
app.get("/posts/:id", async (request, response) => {
    // get the id
    const id = request.params.id
    // return the item
    return posts[id]
})

// run server
app.listen(4000, () => console.log("listening on port 4000"))
```

`koa-server.js`

```js
// Import Our Data
const {Post, posts} = require("./data")
// Import koa
const koa = require("koa")
// import koa router
const koaRouter = require("koa-router")


//create the koa application
const app = new koa()
// create a router for building routes
const router = koaRouter()

// Index Route
// context is a combo of the node request/response objects
router.get("/posts", async (context) => {
    // The response is the value of the context body
    context.body = posts
})

// Show Route
router.get("/posts/:id", async (context) => {
    // get the id
    const id = context.params.id
    // send the item as a response
    context.body = posts[id]
})

// Register routes
app.use(router.routes())
// Turn on the server
app.listen(4000, () => console.log("Server Listening on Port 4000"))
```

### The Create Route

The create route let's us create a new item. We pass the data to create the new item via the request body, so for this we'll need a tool like postman or insomnia in order to make non-get requests (browsers always default to making get requests).

The create route is typically a post request to "/model", in our case "/posts". After editing the code use postman or insomnia to make a post request to localhost:4000/posts and make sure to include a JSON body in the request.

```json
{
    "title":"title of a new post",
    "body": "body of a new post"
}
```

`express-server.js`
*make sure to add the express.json() middleware or it won't be able to read the request body

```js
// Import Our Data
const {Post, posts} = require("./data")
// Import express
const express = require("express")


//create the express application
const app = express()

// parse the body from json in request
app.use(express.json())

//The Index Route
app.get("/posts", (request, response) => {
    // send the posts array as a json response
    response.json(posts)
})

// The Show Route
app.get("/posts/:id", (request, response) => {
    // get the id from params
    const id = request.params.id
    // return json data
    response.json(posts[id])
})

// the Create Route
app.post("/posts", (request, response) => {
    // create the new post, the data sent over is in the request body
    post = new Post(request.body.title, request.body.body)
    // push the new post in the posts array
    posts.push(post)
    // return the new post as json
    response.json(post)
})

// Turn on the server
app.listen(4000, () => console.log("Server Listening on Port 4000"))
```

`fastify-server.js`

```js
// Import Our Data
const {Post, posts} = require("./data")
// Import efastify
const fastify = require("fastify")

// Create application object
const app = fastify({logger: "true"})

// The Index Route
app.get("/posts", async (request, response) => {
    // the response is the return value which is our posts array
    return posts
})

// The Show Route
app.get("/posts/:id", async (request, response) => {
    // get the id
    const id = request.params.id
    // return the item
    return posts[id]
})

// the Create Route
app.post("/posts", async (request, response) => {
    // create the new post, the data sent over is in the request body
    post = new Post(request.body.title, request.body.body)
    // push the new post in the posts array
    posts.push(post)
    // return the new post as json
    return post
})

// run server
app.listen(4000, () => console.log("listening on port 4000"))
```

`koa-server.js`
* make sure to install koa-bodyparser `npm install koa-bodyparser` and import it as outlined below

```js
// Import Our Data
const {Post, posts} = require("./data")
// Import koa
const koa = require("koa")
// import koa router
const koaRouter = require("koa-router")
// import koa bodyparser
const bodyParser = require("koa-bodyparser")


//create the koa application
const app = new koa()
// create a router for building routes
const router = koaRouter()

// Index Route
// context is a combo of the node request/response objects
router.get("/posts", async (context) => {
    // The response is the value of the context body
    context.body = posts
})

// Show Route
router.get("/posts/:id", async (context) => {
    // get the id
    const id = context.params.id
    // send the item as a response
    context.body = posts[id]
})

// the Create Route
router.post("/posts", async (context) => {
    // get the body from context
    const body = context.request.body
    // create the new post, the data sent over is in the request body
    post = new Post(body.title, body.body)
    // push the new post in the posts array
    posts.push(post)
    // return the new post as json
    context.body = post
})

// Register the bodyparser (must be before routes, or routes will run before body is parsed)
app.use(bodyParser())
// Register routes
app.use(router.routes())
// Turn on the server
app.listen(4000, () => console.log("Server Listening on Port 4000"))
```

### Update Route

The Update route takes put or patch request to "/model/:id" and updates the item with the specified id using the data in the request body.

After updating the code use postman/insomnia to make a put request to "/posts/0" with a json body to update the record.

`express-server.js`

```js
// Import Our Data
const {Post, posts} = require("./data")
// Import express
const express = require("express")


//create the express application
const app = express()

// parse the body from json in request
app.use(express.json())

//The Index Route
app.get("/posts", (request, response) => {
    // send the posts array as a json response
    response.json(posts)
})

// The Show Route
app.get("/posts/:id", (request, response) => {
    // get the id from params
    const id = request.params.id
    // return json data
    response.json(posts[id])
})

// the Create Route
app.post("/posts", (request, response) => {
    // create the new post, the data sent over is in the request body
    post = new Post(request.body.title, request.body.body)
    // push the new post in the posts array
    posts.push(post)
    // return the new post as json
    response.json(post)
})

// The Update Route
app.put("/posts/:id", (request, response) => {
    // get the id from the url
    const id = request.params.id
    // get the request body
    const body = request.body
    // get the item to be updated
    const post = posts[id]
    // update the item
    post.title = body.title
    post.body = body.body
    // return the updated item as a json response
    response.json(post)
})

// Turn on the server
app.listen(4000, () => console.log("Server Listening on Port 4000"))
```

`fastify-server.js`

```js
// Import Our Data
const {Post, posts} = require("./data")
// Import efastify
const fastify = require("fastify")

// Create application object
const app = fastify({logger: "true"})

// The Index Route
app.get("/posts", async (request, response) => {
    // the response is the return value which is our posts array
    return posts
})

// The Show Route
app.get("/posts/:id", async (request, response) => {
    // get the id
    const id = request.params.id
    // return the item
    return posts[id]
})

// the Create Route
app.post("/posts", async (request, response) => {
    // create the new post, the data sent over is in the request body
    post = new Post(request.body.title, request.body.body)
    // push the new post in the posts array
    posts.push(post)
    // return the new post as json
    return post
})

// The Update Route
app.put("/posts/:id", async (request, response) => {
    // get the id from the url
    const id = request.params.id
    // get the request body
    const body = request.body
    // get the item to be updated
    const post = posts[id]
    // update the item
    post.title = body.title
    post.body = body.body
    // return the updated item as a json response
    return post
})

// run server
app.listen(4000, () => console.log("listening on port 4000"))
```

`koa-server.js`

```js
// Import Our Data
const {Post, posts} = require("./data")
// Import koa
const koa = require("koa")
// import koa router
const koaRouter = require("koa-router")
// import koa bodyparser
const bodyParser = require("koa-bodyparser")


//create the koa application
const app = new koa()
// create a router for building routes
const router = koaRouter()

// Index Route
// context is a combo of the node request/response objects
router.get("/posts", async (context) => {
    // The response is the value of the context body
    context.body = posts
})

// Show Route
router.get("/posts/:id", async (context) => {
    // get the id
    const id = context.params.id
    // send the item as a response
    context.body = posts[id]
})

// the Create Route
router.post("/posts", async (context) => {
    // get the body from context
    const body = context.request.body
    // create the new post, the data sent over is in the request body
    post = new Post(body.title, body.body)
    // push the new post in the posts array
    posts.push(post)
    // return the new post as json
    context.body = post
})

// The Update Route
router.put("/posts/:id", async (context) => {
    // get the id from the url
    const id = context.params.id
    // get the request body
    const body = context.request.body
    // get the item to be updated
    const post = posts[id]
    // update the item
    post.title = body.title
    post.body = body.body
    // return the updated item as a json response
    context.body = post
})

// Register the bodyparser (must be before routes, or routes will run before body is parsed)
app.use(bodyParser())
// Register routes
app.use(router.routes())
// Turn on the server
app.listen(4000, () => console.log("Server Listening on Port 4000"))
```

### Destroy Route

The destory route is a delete request to "/model/:id" that deletes the item with the specified id. After updating the code use postman/insomnia to send a delete request to "/posts/0" then make a get request to "/posts" to confirm it was deleted. 

`express-server.js`

```js
// Import Our Data
const {Post, posts} = require("./data")
// Import express
const express = require("express")


//create the express application
const app = express()

// parse the body from json in request
app.use(express.json())

//The Index Route
app.get("/posts", (request, response) => {
    // send the posts array as a json response
    response.json(posts)
})

// The Show Route
app.get("/posts/:id", (request, response) => {
    // get the id from params
    const id = request.params.id
    // return json data
    response.json(posts[id])
})

// the Create Route
app.post("/posts", (request, response) => {
    // create the new post, the data sent over is in the request body
    post = new Post(request.body.title, request.body.body)
    // push the new post in the posts array
    posts.push(post)
    // return the new post as json
    response.json(post)
})

// The Update Route
app.put("/posts/:id", (request, response) => {
    // get the id from the url
    const id = request.params.id
    // get the request body
    const body = request.body
    // get the item to be updated
    const post = posts[id]
    // update the item
    post.title = body.title
    post.body = body.body
    // return the updated item as a json response
    response.json(post)
})

// The Destroy Route
app.delete("/posts/:id", (request, response) => {
    // get the id from the url
    const id = request.params.id
    // splice it from the array (remove it)
    const post = posts.splice(id, 1)
    // return the deleted post as json
    response.json(post)
})

// Turn on the server
app.listen(4000, () => console.log("Server Listening on Port 4000"))
```

`fastify-server.js`

```js
// Import Our Data
const {Post, posts} = require("./data")
// Import efastify
const fastify = require("fastify")

// Create application object
const app = fastify({logger: "true"})

// The Index Route
app.get("/posts", async (request, response) => {
    // the response is the return value which is our posts array
    return posts
})

// The Show Route
app.get("/posts/:id", async (request, response) => {
    // get the id
    const id = request.params.id
    // return the item
    return posts[id]
})

// the Create Route
app.post("/posts", async (request, response) => {
    // create the new post, the data sent over is in the request body
    post = new Post(request.body.title, request.body.body)
    // push the new post in the posts array
    posts.push(post)
    // return the new post as json
    return post
})

// The Update Route
app.put("/posts/:id", async (request, response) => {
    // get the id from the url
    const id = request.params.id
    // get the request body
    const body = request.body
    // get the item to be updated
    const post = posts[id]
    // update the item
    post.title = body.title
    post.body = body.body
    // return the updated item as a json response
    return post
})

// The Destroy Route
app.delete("/posts/:id", async (request, response) => {
    // get the id from the url
    const id = request.params.id
    // splice it from the array (remove it)
    const post = posts.splice(id, 1)
    // return the deleted post as json
    return post
})

// run server
app.listen(4000, () => console.log("listening on port 4000"))
```

`koa-server.js`

```js
// Import Our Data
const {Post, posts} = require("./data")
// Import koa
const koa = require("koa")
// import koa router
const koaRouter = require("koa-router")
// import koa bodyparser
const bodyParser = require("koa-bodyparser")


//create the koa application
const app = new koa()
// create a router for building routes
const router = koaRouter()

// Index Route
// context is a combo of the node request/response objects
router.get("/posts", async (context) => {
    // The response is the value of the context body
    context.body = posts
})

// Show Route
router.get("/posts/:id", async (context) => {
    // get the id
    const id = context.params.id
    // send the item as a response
    context.body = posts[id]
})

// the Create Route
router.post("/posts", async (context) => {
    // get the body from context
    const body = context.request.body
    // create the new post, the data sent over is in the request body
    post = new Post(body.title, body.body)
    // push the new post in the posts array
    posts.push(post)
    // return the new post as json
    context.body = post
})

// The Update Route
router.put("/posts/:id", async (context) => {
    // get the id from the url
    const id = context.params.id
    // get the request body
    const body = context.request.body
    // get the item to be updated
    const post = posts[id]
    // update the item
    post.title = body.title
    post.body = body.body
    // return the updated item as a json response
    context.body = post
})

// The Destroy Route
router.delete("/posts/:id", async (context) => {
    // get the id from the url
    const id = context.params.id
    // splice it from the array (remove it)
    const post = posts.splice(id, 1)
    // return the deleted post as json
    context.body = post
})

// Register the bodyparser (must be before routes, or routes will run before body is parsed)
app.use(bodyParser())
// Register routes
app.use(router.routes())
// Turn on the server
app.listen(4000, () => console.log("Server Listening on Port 4000"))
```

## Conclusion

You've now created a full crud api in the three main NodeJS Micro web frameworks! If you'd like to try this exercise again in another language I recommend these tutorials.

- [Full Crud API in Python with Flask and FastAPI](https://tuts.alexmercedcoder.com/2021/7/full_crud_flask_fastapi/)
- [Full Crud API in Ruby with Sinatra](https://tuts.alexmercedcoder.com/2021/7/full_crud_with_sinatra/)

If you'd like to try out some more robust battery included frameworks in these languages try these tutorials:

- [Rest API with Python/Django](https://tuts.alexmercedcoder.com/2021/3/puredjangoapi/)
- [Rest API with Ruby on Rails with 5 frontend builds](https://tuts.alexmercedcoder.com/2020/todoreactangularvue/)
- [API with Typescript/FoalTS](https://tuts.alexmercedcoder.com/2021/5/FoalTS-Typescript-Web-Framework/)
- [Creating an API with DENO](https://tuts.alexmercedcoder.com/2021/5/deno_ts_api/)
- [Working with Python Masonite](https://tuts.alexmercedcoder.com/2021/5/Masonite-Python-Web-Framework-101/)
-[Creating an API with Rust and Rocket](https://tuts.alexmercedcoder.com/2021/3/rustrocket0todeploy/)
- [Creating an API with Dart and Google Shelf](https://tuts.alexmercedcoder.com/2021/3/dartzerotodeploy/)
- [Creating API with C# and .NET 5](https://tuts.alexmercedcoder.com/2021/3/dotnet5/)
- [Creating an API with Java and Spring](https://tuts.alexmercedcoder.com/2021/3/javaspring/)
- [Creating an API with GO and Buffalo](https://tuts.alexmercedcoder.com/2021/3/introtogobuffalo/)
- [Creating an API with PHP and Laravel](https://tuts.alexmercedcoder.com/2021/3/laravelhelloworld/)

If you want to try to rendering pages with your web server here are some other tutorials:
- [Express with Several Templating Engines](https://tuts.alexmercedcoder.com/2021/3/expresstemplatingintro/)
- [Fastify with Liquid](https://tuts.alexmercedcoder.com/2021/4/fastify_web_server/)