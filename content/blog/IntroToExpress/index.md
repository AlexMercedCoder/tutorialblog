---
title: Intro to Express
date: "2020-10-12T22:12:03.284Z"
description: Creating a Backend Server
---

**Watch My Intro to Express Video Playlist Here: https://www.youtube.com/playlist?list=PLY6oTPmKnKbamIu4uuDJ3QNNDU1SoOkjl**

## What is Express and the Node Web Server Ecosystem

When it comes to creating a Web Server no framework in the Node ecosystem stands as tall as ExpressJS. It's a minimalistic unopinionated framework that gives you a lot of flexibility as far as customization. If you enjoy minimalistic frameworks ExpressJS isn't the only option that Node has to offer...

- Koa (From the creators of express)
- Fastify
- Polka
- Merver (My Own Creation)

If you are looking for a more robust Rails/Django like experience, Node has you covered too!

- NestJS
- FoalTS
- Sails
- Loopback

Along with other fun frameworks for special use cases...

- Apollo (For GraphQL APIs)
- SocketIO (For Real Time Applications like chat)

## Getting Started With Express
**It is assumed you have installed Node and NPM, which you can do at nodeJS.org**

To started just create an empty folder somewhere on your workspace and open terminal in that folder and do the following.

```npm init -y```

This will create a package.json file which for now will have the main purpose of tracking our dependencies and scripts. Then let's install our first set of libraries.

```npm i express nodemon```

- Express: Our web framework
- Nodemon: Command to run our files and watch our project files so it will re-run our server when there are file changes.

Next in our folder let's create a .gitignore file to make sure we don't push certain things up to github. The file should contain...

```
/node_modules
.env
```

Now create a file called server.js with the following...

```js
//BRING IN EXPRESS
const express = require("express")
//CREATE EXPRESS APPLICATION OBJECT
const app = express()
//PORT THE SERVER WILL LISTEN ON
const PORT = process.env.PORT || 3000 //use environment variables and if not, 3000



//OUR SEVER LISTENER, SHOULD ALWAYS BE AT THE BOTTOM
app.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`)
})

```

The skeleton of our server is now created, let's create some scripts in our package.json.

```json
"scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
}
```

If for some reason nodemon causes any issues a workaround is to change the dev script to ```npx nodemon server.js```.

Now that the scripts are setup in your terminal type ```npm run dev``` to run the dev script. You should see "Listening on port 3000" in your terminal which means your server is running!

Open up your browser and go to http://localhost:3000 and you'll see "cannot get /", this is good it means your server is running. What this means is we have not defined a "get" route for "/".

While your server is running it is listening for requests and it will look for routes that you define that match the http verb (get) and the endpoint (/) to figure out how to respond. Unfortunately, we haven't defined any routes yet! Let's do that.

```js
//BRING IN EXPRESS
const express = require("express")
//CREATE EXPRESS APPLICATION OBJECT
const app = express()
//PORT THE SERVER WILL LISTEN ON
const PORT = process.env.PORT || 3000 //use environment variables and if not, 3000

//ROUTES DEFINED BY A FUNCTION NAMED AFTER THE VERB ITS RESPONDING TO
//Takes a string for the endpoint, and a callback to define handling
app.get("/",(request, response) => {
    response.send("Hello World") //Sending back a text response
})

//THIS ROUTE HAS A URL PARAM, VARIABLE IS NOTED WITH A COLON
app.get("cheese/:param", (request, response) =>{
    const {params, query} = request //Destructuring URL params and URL queries from request object
    response.json({params, query}) // Sending a JSON Response
})



//OUR SEVER LISTENER, SHOULD ALWAYS BE AT THE BOTTOM
app.listen(PORT, () => {
    console.log(`Listening on port ${PORT}`)
})

```

After saving these changes you'll notice in the terminal nodemon will restart your server. Now let's test these out!

Go to...
```http://localhost:3000/```
You should see the string "Hello World"

Go to...
```http://localhost:3000/cheese/thisisaparam?this=is&a=query```
You should see an object with a param and query object show the above data

## Other things you can do

Read the express documentation to learn how to do the following:

- Serve static files like html using express.static
- Render templates using response.render in the templating language of your choice (ejs, pug, handlebars, mustache, express-react-views)
- use middleware to parse request bodies (express.json() & express.urlencoded())
- create clusters of routes with routers (express.Router())

You can also learn all this from my express playlist linked in the beginning of this post.