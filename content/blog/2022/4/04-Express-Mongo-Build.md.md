---
title: Express/EJS/Mongooose Build from Zero to Deploy
date: "2022-04-19"
description: "Building A Full Stack Application with ExpressJS"
author: "Alex Merced"
category: "javascript"
bannerImage: "/images/postbanner/2022/batch-streaming.png"
tags:
  - backend
  - javascript
  - node
---

[Repo With Code From this tutorial for reference](https://github.com/AlexMercedCoder/epress-ejs-tutorial-code)

This article assumes basic knowledge of ExpressJS, if your new to Express or Mongo I recommend starting with the following Video Playlists:

- [ExpressJS Video Playlist](https://youtube.com/playlist?list=PLY6oTPmKnKbamIu4uuDJ3QNNDU1SoOkjl)
- [MongoDB Video Playlist](https://youtube.com/playlist?list=PLY6oTPmKnKbaSCVF-Imd1hkQJvl8iLrV3)
- [ExpressJS Cheatsheet](https://main.grokoverflow.com/posts/2022/04-2022-expressjs-cheatsheet)
- [MongooseJS Cheatsheet](https://main.grokoverflow.com/posts/2022/04-mongoosejs-cheatsheet)

## Mongo Setup

- go to mongodb.com and create an account
- create a new free cluster (all the defaults are fine)
- create username and password for accessing database (under database access)
- whitelist all IP addresses under network access (0.0.0.0)
- on the main dashboard, click on connect, select connecting your app and get the template url for connecting to your database.

`mongo+srv://username:password@mongodb.com/databaseName`

make sure the username and password sections have the username and password you created under database access and the databaseName part can be anything you like.

This is your Mongo URI.

## Express Setup

## Setup

- Open your IDE and terminal to an empty folder and type following commands

- create a server.js `touch server.js`

- create a new npm project `npm init -y`

- install dependencies `npm install express mongoose method-override ejs dotenv morgan`

- install nodemon globally `npm install -g nodemon`

- setup the following scripts in package.json

```json
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
```

#### Summary of Dependencies

    - express => web framework for create server and writing routes

    - mongoose => ODM for connecting to and sending queries to a mongo database

    - method-override => allows us to swap the method of a request based on a URL query

    - ejs => our templating engine

    - dotenv => will allow us to use a `.env` file to define environmental variables we can access via the `process.env` object

    - morgan => logs details about requests to our server, mainly to help us debug

- create a `.env` file with the following dependencies

```
DATABASE_URL=<use your mongodb.com url>
PORT=4000
```
- create a `.gitignore` file with the following (always a good habit to make one even if you have a global .gitignore, the global is there to catch you in case)

```
/node_modules
.env
```

## Setting Up Our server.js

### Import our dependencies

```js
/////////////////////////////////////////////
// Import Our Dependencies
/////////////////////////////////////////////
require("dotenv").config() // Load ENV Variables
const express = require("express") // import express
const morgan = require("morgan") //import morgan
const methodOverride = require("method-override")
const mongoose = require("mongoose")
```

### Establish Database Connection

```js
/////////////////////////////////////////////
// Database Connection
/////////////////////////////////////////////
// Setup inputs for our connect function
const DATABASE_URL = process.env.DATABASE_URL
const CONFIG = {
    useNewUrlParser: true,
    useUnifiedTopology: true
  }

// Establish Connection
mongoose.connect(DATABASE_URL, CONFIG)

// Events for when connection opens/disconnects/errors
mongoose.connection
.on("open", () => console.log("Connected to Mongoose"))
.on("close", () => console.log("Disconnected from Mongoose"))
.on("error", (error) => console.log(error))
```

### Create Our Todo Model

```js
////////////////////////////////////////////////
// Our Models
////////////////////////////////////////////////
// pull schema and model from mongoose
const {Schema, model} = mongoose

// make fruits schema
const todoSchema = new Schema({
    text: String
})

// make fruit model
const Todo = model("Todo", todoSchema)
```
### Create App Object

```js
/////////////////////////////////////////////////
// Create our Express Application Object
/////////////////////////////////////////////////
const app = express()
```

### Register our Middleware

```js
/////////////////////////////////////////////////////
// Middleware
/////////////////////////////////////////////////////
app.use(morgan("tiny")) //logging
app.use(methodOverride("_method")) // override for put and delete requests from forms
app.use(express.urlencoded({extended: true})) // parse urlencoded request bodies
app.use("/static", express.static("static")) // serve files from public statically
```

### Our initial route

```js
////////////////////////////////////////////
// Routes
////////////////////////////////////////////
app.get("/", (req, res) => {
    res.render("index.ejs", {greeting: "Hello"})
})
```

### Server Listener

```js
//////////////////////////////////////////////
// Server Listener
//////////////////////////////////////////////
const PORT = process.env.PORT
app.listen(PORT, () => console.log(`Now Listening on port ${PORT}`))
```

### The complete server.js file

```js
/////////////////////////////////////////////
// Import Our Dependencies
/////////////////////////////////////////////
require("dotenv").config() // Load ENV Variables
const express = require("express") // import express
const morgan = require("morgan") //import morgan
const methodOverride = require("method-override")
const mongoose = require("mongoose")

/////////////////////////////////////////////
// Database Connection
/////////////////////////////////////////////
// Setup inputs for our connect function
const DATABASE_URL = process.env.DATABASE_URL
const CONFIG = {
    useNewUrlParser: true,
    useUnifiedTopology: true
  }

// Establish Connection
mongoose.connect(DATABASE_URL, CONFIG)

// Events for when connection opens/disconnects/errors
mongoose.connection
.on("open", () => console.log("Connected to Mongoose"))
.on("close", () => console.log("Disconnected from Mongoose"))
.on("error", (error) => console.log(error))

////////////////////////////////////////////////
// Our Models
////////////////////////////////////////////////
// pull schema and model from mongoose
const {Schema, model} = mongoose

// make fruits schema
const todoSchema = new Schema({
    text: String
})

// make fruit model
const Todo = model("Todo", todoSchema)

/////////////////////////////////////////////////
// Create our Express Application Object
/////////////////////////////////////////////////
const app = express()

/////////////////////////////////////////////////////
// Middleware
/////////////////////////////////////////////////////
app.use(morgan("tiny")) //logging
app.use(methodOverride("_method")) // override for put and delete requests from forms
app.use(express.urlencoded({extended: true})) // parse urlencoded request bodies
app.use("/static", express.static("static")) // serve files from public statically

////////////////////////////////////////////
// Routes
////////////////////////////////////////////
app.get("/", (req, res) => {
    res.render("index.ejs", {greeting: "Hello"})
})

//////////////////////////////////////////////
// Server Listener
//////////////////////////////////////////////
const PORT = process.env.PORT
app.listen(PORT, () => console.log(`Now Listening on port ${PORT}`))
```

- create a views and static folder `mkdir views static`
- create index.ejs in the views folder with the following
```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Our Basic Todo App</title>
</head>
<body>
    <%= greeting %>
    
</body>
</html>
```

- run server `npm run dev`
- visit `localhost:4000` to see if our test route works

## Seeding some todos
Let's seed our database with some initial todos using a seed route, a route whose only purpose is to reset our database with some sample data. This route should be commented out in production as you don't want users erasing your database by accident. We will also update our main route so all the todos are being passed to the main page.

```js
////////////////////////////////////////////
// Routes
////////////////////////////////////////////
app.get("/", async (req, res) => {

    // get todos
    const todos = await Todo.find({})

    // render index.ejs
    res.render("index.ejs", {todos})
})

app.get("/seed", async (req, res) => {
    // delete all existing todos
    await Todo.remove({})

    // add sample todos
    await Todo.create([{text: "Eat Breakfast"}, {text: "Eat Lunch"}, {text: "Eat Dinner"}])
    
    // redirect back to main page
    res.redirect("/")
})
```

Then update `views/index.ejs` to show all the todos:

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Our Basic Todo App</title>
</head>
<body>
    <h1>Todos</h1>
    <ul>
        <% for (todo of todos) { %>
        
            <li><%= todo.text %></li>
        
        <% } %>
    </ul>
    
</body>
</html>
```

No go back to the main page, you will see no todos then to `localhost:4000/seed` and you'll see the todos now show up since the seed route added them to the database.

Now let's create a route so we can create todos and then we will add a form that posts to that route.

server.js
```js
app.post("/todo", async (req, res) => {
    //create the new todo
    await Todo.create(req.body)
    // redirect to main page
    res.redirect("/")
})
```

index.ejs
```js
<body>
    <h1>Todos</h1>

    <h2> Add Todo</h2>
    <form action="/todo" method="post">
        <input type="text" name="text" placeholder="new todo">
        <input type="submit" value="create new todo">
    </form>
    <ul>
        <% for (todo of todos) { %>
        
            <li><%= todo.text %></li>
        
        <% } %>
    </ul>
    
</body>
```

Refresh the main page, you should now see a form and when you fill it out and submit it will make a post request to our new route which will create the new todo then redirect us back to the main page!

Now let's add the ability to remove todos. We will add a delete route that will delete the specified todo (the database id of the todo will be passed in the url as a param). After deleting the route will redirect us back to the main page. We will then add to our for loop in index.js a form that is just a submit button for making that delete request (we will use method override to overcome the method limitations of html forms.)

server.js
```js
app.delete("/todo/:id", async (req, res) => {
    // get the id from params
    const id = req.params.id
    // delete the todo
    await Todo.findByIdAndDelete(id)
    // redirect to main page
    res.redirect("/")
})
```

index.ejs
```html
<body>
    <h1>Todos</h1>

    <h2> Add Todo</h2>
    <form action="/todo" method="post">
        <input type="text" name="text" placeholder="new todo">
        <input type="submit" value="create new todo">
    </form>
    <ul>
        <% for (todo of todos) { %>
        
            <li><%= todo.text %> 
            
                <form action="/todo/<%= todo._id %>?_method=delete" method="post">
                    <input type="submit" value="delete todo">
                </form>
            
            </li>
        
        <% } %>
    </ul>
    
</body>
```

See that wasn't so hard, right? Now let's deploy it:

### Deployment

- commit and push the code up to github
- create a new project on heroku.com
- under the deployment tab, select the github method of deployment
- select your repository from your github account
- enable automatic deploys (so it'll update when the repo updates)
- click on manual deploy and watch it deploy

The app will still not be working yet cause it has no idea what your database string is since that was hidden in our .env file. To define environment variables on Heroku:

- Go to the settings tab
- scroll down and reveal the config vars
- add a new variable with the key of "DATABASE_URL" and the key of your mongo uri (it has to be the same key you used in your local .env since)

That's it, your app should be working now!

#### Keep On Learning

- Add some CSS by adding a CSS file in the static folder and adding a link tag in the head of index.ejs

`<link rel="stylesheet" href="/static/nameOfCssFile.css">`

- Similarly add a frontend JS file in your static file and connect it

`<script src="/static/nameOfJsFile.js" defer></script>`

- You can also load other frontend libraries like jQuery, Alpine, HTMX, React and Vue with script tags, then you can use them to add more frontend interactivity

- Use express routes to move the routes out of server.js into a controllers folder to better follow MVC architecture (you'll need to know how to import and export in node)

- Move the mongoose model code into a models folder for better MVC architecture

**For small solo projects it's ok to have everything in one file, but for group projects with lots of code you want the code broken up into many files with a common organization for better collaboration and less git merge conflicts (since people don't have to work in the same file)**