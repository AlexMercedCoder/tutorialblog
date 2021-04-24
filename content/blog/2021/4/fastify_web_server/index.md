---
title: Intro to Fastify & The Liquid Templating Language
date: "2021-04-24T12:12:03.284Z"
description: Making Sure React Works
---

## What is Fastify

In the world of Node, there are several frameworks for creating web servers. While Express is the most popular, frameworks like Koa, Polka and Fastify provide an alternative.

Fastify aims to be a blazing fast option, boasting being able to handle up to 30,000 requests per second, based on the depth of your code of course.

## Why does speed matter?

If your server starts hitting the peak of the number of requests it can handle then you have one of two issues...

- Requests take longer to be handled hurting the user experience

- You need to spin up more servers, which is an expense along with load-balancers and other infrastructure considerations.

So speed saves money and improves the user experience, sounds like it matters.

## Pre-requisites

- The Latest Version of Node as I'll be using ES Modules which require a newer version of

- If not sure if you have the latest version the following commands should get you up to date

1. `sudo npm install -g n`
2. `sudo n latest`

## Building your first Fastify Web App

1. Open your terminal to an empty folder and create a new node project with the command `npm init -y`

2. Install Fastify `npm install fastify`

3. In your package.json add the `"type": "module"` property so we can use ES Module syntax and the `"start": "node server.js"` script should look like this.

```js
  "type": "module",
  "scripts": {
    "start": "node server.js"
  },
```

3. create a file called `server.js` and inside of it write the following code

```js
// IMPORT OUR DEPENDENCIES
import fastify from "fastify"

// CREATE OUR SERVER OBJECT
const server = fastify({ logger: true })

// WRITE OUR FIRST ROUTE
server.get("/", (request, response) => {
  response.send({ you: "did it" })
})

// GET THE SERVER LISTENING ON PORT 4000
server.listen(4000, (error, address) => {
  // Log address if server starts, log error if it fails
  console.log(error ? error : `listening on ${address}`)
})
```

4. Start the server with the command `npm start` and go to `localhost:4000` in your browser to see our message to confirm it worked!

You did it, you've created a webserver!

## Installing Liquid for Templating

Templating allows us to generate full-on HTML pages dynamically from the server. Shopify has created its own templating language for its platform called Liquid. Libraries have been added to Node so we can use Liquid on our web server away from Shopify, how cool!

1. install liquid `npm install liquidjs`

2. install point of view which allows us to connect templating libraries to Fastify `npm install point-of-view`

3. Shut off your server with `ctrl+c` in your terminal

4. Update your `server.js`

```js
// IMPORT OUR DEPENDENCIES
import fastify from "fastify"
import POV from "point-of-view"
import { Liquid } from "liquidjs"
import path from "path"

// CREATE OUR SERVER OBJECT
const server = fastify({ logger: true })
const __dirname = path.resolve(path.dirname(""))

// Generate Liquid Engine
const engine = new Liquid({
  root: path.join(__dirname, "views"),
  extname: ".liquid",
})

// Register the engine with our fastify server
server.register(POV, {
  engine: {
    liquid: engine,
  },
})

// WRITE OUR FIRST ROUTE
server.get("/", (request, response) => {
  response.send({ you: "did it" })
})

server.get("/cheese", (request, response) => {
  response.view("./views/cheese.liquid", { cheese: "gouda" })
})

// GET THE SERVER LISTENING ON PORT 4000
server.listen(4000, (error, address) => {
  // Log address if server starts, log error if it fails
  console.log(error ? error : `listening on ${address}`)
})
```

5. Create a folder called `views` and inside it create a file called `cheese.liquid`

```html
<h1>{{cheese}}</h1>
```

**NOTE** We are injecting the cheese variable we passed in the object passed in the call to response.view in server.js.

6. run your server.js `npm start`

7. go to `localhost:4000/cheese` and see our page, notice it says Gouda, not cheese!

## More on Liquid Syntax

As you can see when we go to different URLs, it matches up with different routes we create which determines they are handled. That last route uses the liquid engine to take a liquid file, parse it and generate an HTML file with the placeholders we wrote filled in, kind of like mad libs. Let's examine a few more Liquid features.

### Conditionals

Add the following route to server.js

```js
server.get("/iseven/:num", (request, response) => {
  // determine if the number in the url is even
  const isEven = parseInt(request.params.num) % 2 === 0;
  // render a template
  response.view("./views/iseven.liquid", { isEven });
});
```

Then in your views folder create an iseven.liquid file with the following:

```html
{% if isEven %}
It is even
{% else %}
It is odd
{% endif %}
```

Turn on your server and go to `localhost:4000/iseven/5` then `localhost:4000/6` to make sure the correct responses show up either way.

## Iteration

Add the following route to server.js

```js
server.get("/array/:one/:two/:three", (request, response) => {
    // destructure the params
    const {one, two, three} = request.params
    // render a template
    response.view("./views/array.liquid", {arr: [one, two, three]})
})
```

Create array.liquid in the views folder with the following

```html
<ul>
{% for item in arr %}
<li>{{item}}</li>
{% endfor %}
</ul>
```

restart your server and go to `localhost:4000/array/1/2/3`

## In Conclusion

Your final server.js should look like

```js
// IMPORT OUR DEPENDENCIES
import fastify from "fastify";
import POV from "point-of-view";
import { Liquid } from "liquidjs";
import path from "path";

// CREATE OUR SERVER OBJECT
const server = fastify({ logger: true });
const __dirname = path.resolve(path.dirname(""));

// Generate Liquid Engine
const engine = new Liquid({
  root: path.join(__dirname, "views"),
  extname: ".liquid",
});

// Register the engine with our fastify server
server.register(POV, {
  engine: {
    liquid: engine,
  },
});

// WRITE OUR FIRST ROUTE
server.get("/", (request, response) => {
  response.send({ you: "did it" });
});

server.get("/cheese", async (request, response) => {
  response.view("./views/cheese.liquid", { cheese: "gouda" });
});

server.get("/iseven/:num", (request, response) => {
  // determine if the number in the url is even
  const isEven = parseInt(request.params.num) % 2 === 0;
  // render a template
  response.view("./views/iseven.liquid", { isEven });
});

server.get("/array/:one/:two/:three", (request, response) => {
    // destructure the params
    const {one, two, three} = request.params
    // render a template
    response.view("./views/array.liquid", {arr: [one, two, three]})
})

// GET THE SERVER LISTENING ON PORT 4000
server.listen(4000, (error, address) => {
  // Log address if server starts, log error if it fails
  console.log(error ? error : `listening on ${address}`);
});
```

- [LEARN MORE ABOUT FASTIFY](https://www.fastify.io/docs/latest/)
- [LEARN MORE ABOUT LIQUID](https://shopify.github.io/liquid/)