---
title: Intro to Express, Templating and API's (EJS, Handlebars, Mustache, Pug)
date: "2021-03-04T12:12:03.284Z"
description: Tales of PHP's Demise are Exaggerated
---

Express is by far the most popular backend web framework in the NodeJS world. It is a right of passage for every javascript developer to learn how to create full-stack applications and APIs. 

In this blog post, we'll introduce you to setting up an express project, working with the most popular templating libraries for server-side rendered websites, and how to create APIs to send JSON data to use React/Angular/Vue/Svelte to create client-side rendered websites.

## Prerequisites

To follow this tutorial you need to have the following installed
- nodeJS 14 or later
- A Web Browser (Chrome)
- A Text Editor (Visual Studio Code)
- Bash Terminal (the native terminal on Mac/Linux, download git-bash for windows)

## Setup

Open up your editor and terminal to an empty folder for the project and follow the following directions:

- create a fresh npm project by running ```npm init -y``` which will create a fresh package.json file that will track our dependencies.

- run the command ```npm install express nodemon``` this will install the two libraries and create a node_modules folder that holds all the libraries we will install. Notice both libraries have been added in the dependencies section of the package.json file.

- create a views folder, this folder will be used for holding all our templates later on.

- create a public folder for demonstrating static folders later on

## Round 1 - Serving a Static HTML File

- create a file `server_static.js`

- adjust the scripts in your package.json to look like this

```json
"scripts": {
    "static": "nodemon server_static.js"
  }
```

- add the following to file `console.log("it works")`

- run the command `npm run static`

**You'll notice nodemon begins watching your files and you'll see your log (nodemon restarts your server when you make changes to its source code). Whenever we say `npm run <command>` it will run a command by the same name from package.json scripts, neat! To have nodemon stop watching your files use ctrl+c or command+c to kill the process in your terminal**

- Now enter the following code, read the comments to understands what it is doing.

```js
// We are importing the express library
const express = require("express")

// We use express to create an application object that represents our server
const server = express()


// Tell our server serve the assets in public folder statically
server.use(express.static("public"))


// Tell our server to start listening for requests on port 1985, my birth year 😆
// Second argument is a function we can use to post a message we are up and running!
server.listen(1985, () => console.log("🤠 Server Listening on Port 1985 🤠"))
```

- add a file called index.html inside of public like so

```html
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document</title>
</head>
<body>
    <h1>This folder is served statically. When you go to the base url it will look for an index.html in this folder as the main page.</h1>
</body>
</html>
```

- run your server with the command `npm run static` then go to localhost:1985 in your browser and you'll see the html file load up! Ta da, you just served a static site with express!

## EJS Templating

There are many templating languages. The way they work is you'll create a template that can have placeholders (variables). So we will use a render function to tell express to render the template along with some data to fill those variables.

- first let's install ejs `npm install ejs`

- create another file `server_ejs.js`

- let's add another script in package.json

```json
  "scripts": {
    "static": "nodemon server_static.js",
    "ejs": "nodemon server_ejs.js"
  }
```

- Put the following in server_ejs.js

```js
// We are importing the express library
const express = require("express")

// We use express to create an application object that represents our server
const server = express()

// We Tell Express to Look for ejs files when we use the render function
// templates are by default looked for in the views folder
server.set("view engine", "ejs")

// We create a "route" for the root url "/" what will render a template
server.get("/", (request, response) => {
    // the render function takes two arguments
    // 1. the file to look for in the views to use as the template
    // 2. an object of data to make available to the template
    response.render("index", {
        cheese: "gouda",
        bread: "rye"
    })
})

// Tell our server to start listening for requests on port 1985, my birth year 😆
// Second argument is a function we can use to post a message we are up and running!
server.listen(1985, () => console.log("🤠 Server Listening on Port 1985 🤠"))
```

- in the views folder make a file called index.ejs with the following

```js
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document</title>
</head>
<body>
    <h1><%= cheese %></h1>
    <h1><%= bread %></h1>
    
</body>
</html>
```

- Run the server with `npm run ejs` then go to localhost:1985 and you'll see our data got injected in the template!!!

**[Learn EJS Syntax Here](https://ejs.co/)**

## Mustache

- first, let's install mustache `npm install mustache-express`

- create another file `server_mustache.js`

- let's add another script in package.json

```json
  "scripts": {
    "static": "nodemon server_static.js",
    "ejs": "nodemon server_ejs.js",
    "mustache": "nodemon server_mustache.js",
  }
```

- Put the following in server_mustache.js

```js
// We are importing the express library
const express = require("express")

//import mustache-express
const mustache = require('mustache-express')

// We use express to create an application object that represents our server
const server = express()

// We Tell Express to Look for mustache files when we use the render function
// templates are by default looked for in the views folder
server.engine('mustache', mustache()) //Change the view engine
server.set("view engine", "mustache")

// We create a "route" for the root url "/" what will render a template
server.get("/", (request, response) => {
    // the render function takes two arguments
    // 1. the file to look for in the views to use as the template
    // 2. an object of data to make available to the template
    response.render("index", {
        cheese: "munster",
        bread: "wheat"
    })
})

// Tell our server to start listening for requests on port 1985, my birth year 😆
// Second argument is a function we can use to post a message we are up and running!
server.listen(1985, () => console.log("🤠 Server Listening on Port 1985 🤠"))
```

- in the views folder make a file called index.mustache with the following

```js
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document</title>
</head>
<body>
    <h1>{{cheese}}</h1>
    <h1>{{bread}}</h1>
    
</body>
</html>
```

- Run the server with `npm run mustache` then go to localhost:1985 and you'll see our new data got injected in the template!!!

**[Learn Mustache Syntax Here](https://github.com/janl/mustache.js)**

## Handlebars

- first, let's install handlebars `npm install express-handlebars`

- create another file `server_handlebars.js`

- let's add another script in package.json

```json
  "scripts": {
    "static": "nodemon server_static.js",
    "ejs": "nodemon server_ejs.js",
    "mustache": "nodemon server_mustache.js",
    "handlebars": "nodemon server_handlebars.js"
  }
```

- Put the following in server_handlebars.js

```js
// We are importing the express library
const express = require("express")

//import mustache-express
const handlebars = require('express-handlebars')

// We use express to create an application object that represents our server
const server = express()

// We Tell Express to Look for mustache files when we use the render function
// templates are by default looked for in the views folder
server.engine('handlebars', handlebars()) //Change the view engine
server.set("view engine", "handlebars")

// We create a "route" for the root url "/" what will render a template
server.get("/", (request, response) => {
    // the render function takes two arguments
    // 1. the file to look for in the views to use as the template
    // 2. an object of data to make available to the template
    response.render("index", {
        cheese: "pepper jack",
        bread: "oat"
    })
})

// Tell our server to start listening for requests on port 1985, my birth year 😆
// Second argument is a function we can use to post a message we are up and running!
server.listen(1985, () => console.log("🤠 Server Listening on Port 1985 🤠"))
```

- in the views folder make a folder called layouts and make a main.handlebars with the following

```js
<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta http-equiv="X-UA-Compatible" content="IE=edge">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document</title>
</head>
<body>
{{{body}}}
    
</body>
</html>
```

- then in the views folder make an index.handlebars with the following

```html
    <h1>{{{cheese}}}</h1>
    <h1>{{{bread}}}</h1>
```

- Run the server with `npm run handlebars` then go to localhost:1985 and you'll see our new data got injected in the template!!!

**[Learn Handlebars Syntax Here](https://handlebarsjs.com/)**

## Pug

- first, let's install pug `npm install pug`

- create another file `server_pug.js`

- let's add another script in package.json

```json
  "scripts": {
    "static": "nodemon server_static.js",
    "ejs": "nodemon server_ejs.js",
    "mustache": "nodemon server_mustache.js",
    "handlebars": "nodemon server_handlebars.js",
    "pug": "nodemon server_pug.js"
  }
```

- Put the following in server_pug.js

```js
// We are importing the express library
const express = require("express")

// We use express to create an application object that represents our server
const server = express()

// Set the view engine to pug
server.set('view engine', 'pug')

// We create a "route" for the root url "/" what will render a template
server.get("/", (request, response) => {
    // the render function takes two arguments
    // 1. the file to look for in the views to use as the template
    // 2. an object of data to make available to the template
    response.render("index", {
        cheese: "brie",
        bread: "corn"
    })
})

// Tell our server to start listening for requests on port 1985, my birth year 😆
// Second argument is a function we can use to post a message we are up and running!
server.listen(1985, () => console.log("🤠 Server Listening on Port 1985 🤠"))
```

- then in the views folder make an index.pug with the following

```pug
    h1 hello world #{cheese} & #{bread}
```

- Run the server with `npm run pug` then go to localhost:1985 and you'll see our new data got injected in the template!!!

**[Learn Pug Syntax Here](https://pugjs.org/language/attributes.html)**

## Express API

So far we have served files statically and generated web pages using server-side templating engines. Another thing we can do is have our routes return JSON data instead of a web page. This way we can build APIs that allow us to instead build our frontend using a client-side UI library/framework like jQuery, React, Angular, Svelte, and Vue. 

- create a new file, server_api.js

- since the fetch function doesn't exist natively in node as it does in the browser we can use using the node-fetch library. Install it, `npm install node-fetch`.

- add a new script to package.json

```json
  "scripts": {
    "static": "nodemon server_static.js",
    "ejs": "nodemon server_ejs.js",
    "mustache": "nodemon server_mustache.js",
    "handlebars": "nodemon server_handlebars.js",
    "pug": "nodemon server_pug.js",
    "api": "nodemon server_api.js"
  }
```

- in the server_api.js add this

```js
// We are importing the express library
const express = require("express")

// Make the fetch function available with node-fetch to call other apis
const fetch = require("node-fetch")

// We use express to create an application object that represents our server
const server = express()

// We create a "route" for the root url "/" what will return a javascript object as json
server.get("/", (request, response) => {

    //any object or array send via response.json will be sent as json data
    response.json({
        cheese: "cheddar",
        bread: "italian",
        // the request.query object contains an url queries from the request
        query: request.query
    })

})

// A second route using a url param to grab data from the url, any part of the url with a : is a variable
server.get("/proxy/:num", (request, response) => {
    // Before we send a response we can get a data from other sources like databases or other apis
    // We will call data from another api and use our url param to modify the call
    // all the params are made available in the request.params object
    const id = request.params.num
    //notice we interpolate the param in the url so you can grab different post by number
    fetch(`https://jsonplaceholder.typicode.com/todos/${id}`)
  .then(response => response.json())
  .then(data => response.json({
      params: request.params,
      data
  }))
})

// Tell our server to start listening for requests on port 1985, my birth year 😆
// Second argument is a function we can use to post a message we are up and running!
server.listen(1985, () => console.log("🤠 Server Listening on Port 1985 🤠"))
```

- start your server with `npm run api`

- test the main url without a url query `localhost:1985`

- then test the main url with a query `localhost:1985?cheese=gouda&bread=rye`

- then test the second route with multiple numbers

    - `localhost:1985/proxy/1`
    - `localhost:1985/proxy/2`
    - `localhost:1985/proxy/3`

**The beauty of making API calls from your backend server is that you can avoid CORS errors. So instead your frontend would make a request to your server who delivers the API data as a go-between (AKA, a Proxy).**

## Conclusion

What have we learned?

- Installing npm libraries
- adding and using scripts to package.json
- how to create an express server that serves static files
- how to create an express server that renders templates
- how to create an express server that sends JSON data
- how to use URL queries in your express routes
- how to use URL params in your express routes
- how to call an API in your routes

Your express applications can do all of the above at the same time, be creative and experiment. You'll find express to be a very flexible platform to build the backend services your application needs.