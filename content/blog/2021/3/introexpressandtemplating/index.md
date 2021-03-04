---
title: Intro to Express, Templating and API's (EJS, Handlebars, Mustache, Pug)
date: "2021-03-04T12:12:03.284Z"
description: Tales of PHP's Demise are Exaggerated
---

Express is by far the most popular backend web framework in the NodeJS world. It is a right of passage for every javascript developer to learn how to create full stack applications and API's. 

In this blog post we'll introduce you setting up an express project, working with the most popular templating libraries for server side rendered websites, and how to create API's to send JSON data to use React/Angular/Vue/Svelte to create client-side rendered websites.

## Prerequisites

To follow this tutorial you need to have the following installed
- nodeJS 14 or later
- A Web Browser (Chrome)
- A Text Editor (Visual Studio Code)
- Bash Terminal (the native terminal on Mac/Linux, download git-bash for windows)

## Setup

Open up your editor and terminal to an empty folder for the project and follow the following directions:

- create a fresh npm project by running ```npm init -y``` which will create a fresh package.json file which will track our dependencies.

- run the command ```npm install express nodemon``` this will install the two libraries and create a node_modules folder which holds all the libraries we will install. Notice both libraries have been added in the dependencies section of the package.json file.

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

**You'll notice nodemon begins watching your files and you'll see your log. Whenever we say `npm run <command>` it will run a command by the same name from package.json scripts, neat! To have nodemon stop watching your files use ctrl+c or command+c to kill the process in your terminal**

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

- first let's install ejs `npm install mustache-express`

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

- first let's install ejs `npm install express-handlebars`

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