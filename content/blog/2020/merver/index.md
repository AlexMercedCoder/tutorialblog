---
title: Create Your Next Microservice with Merver!
date: "2020-10-17T22:12:03.284Z"
description: NodeJS Micro-Web Framework
---

## What is Merver?

In my effort to better understand the NodeJS core libraries I started playing with the HTTP library trying to recreate many of the features I enjoy from frameworks like express, fastify and polka. In doing so I ended up creating a fairly useable micro-webframework that I call Mever.

## Getting Started

You can install the library and follow the documentation to get you started but I have a template you can scaffold that has all the initial setup done for you, just run the following command.

```npx merced-spinup merver projectName```

Change directory into the new folder and run ```npm install```

You have to two scripts

```npm run dev``` to run in development mode
```npm start``` to run in production mode

## Configuration

In the configuration folder you have two files...

#### configs/config.js

In this file you can configure your server such as cors headers, static folders and more.

#### configs/db.js

configure your database connection in this file

## middleware/globals.js

Here is where you can define global middleware, (route middleware is configured in your route objects). Pass any middleware into the addMiddlware function which you'll see in the existing examples.

What is going on is each middleware is being registered to a middler object which when invoked will run all the middleware registered to it passing the request and response object to each one.

The server runs a middler object before running a responder object with all the routes when handling a request.

By default a basic logger and bodyParser(json and urlencoded) middleware is already configured.

## controllers/responses/

In this folder create and export your response objects (routes). Each end point gets one object where you can make a handler for the particular verb like so...

```js
module.exports = {
    endpoint: '/',
    GET: (req, res) => {res.html(`<h1>It Works!</h1>`)},
    POST: (req, res) => {res.json({it: 'works'})},
    PUT: (req, res) => {res.json({it: 'works'})},
    DELETE: (req, res) => {res.json({it: 'works'})}
}
```

then import the object into **controllers/responder.js**

```js
const {Responder} = require('am-merver')
const responder = new Responder()

// Import Responses
const root = require('./responses/root')

// Register Responses
responder.newResponse(root)

// Export Responder
module.exports = responder
```

## That's it

Write your routes like you normally would. Url Params and Url queries work just like you'd expect them to work in express.