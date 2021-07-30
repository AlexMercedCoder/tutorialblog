---
title: Basics of Building a CRUD API with Node (no framework)
date: "2021-07-30T12:12:03.284Z"
description: Learning the Node HTTP/HTTPS library
---

In this tutorial we once again create a full CRUD api without a database. In this article we won't use a pre-existing framework but the standard node libraries that underpin all our favorite frameworks.

## Summary of RESTful Convention

THe restful convention gives us a blueprint of making the basic routes for CRUD (Create, Read, Update, Delete) functionality in a uniform way.

API Restful Routes

| Name of Route | Request Method | Endpoint     | Result                                           |
| ------------- | -------------- | ------------ | ------------------------------------------------ |
| Index         | GET            | `/model`     | returns list of all items                        |
| Show          | GET            | `/model/:id` | returns item with matching id                    |
| Create        | Post           | `/model`     | creates a new item, returns item or confirmation |
| Update        | Put/Patch      | `/model/:id` | Updated item with matching ID                    |
| Destroy       | Delete         | `/model/:id` | Deletes item with matching ID                    |

If we weren't build an API but instead rendering pages on the server there would be two additional routes. New, which renders a page with a form to create a new object, submitting the form triggers the create route. Edit, which renders a page with a form to edit an existing object, submitting the form triggers the Update route.

Since we are building an api, Edit and New aren't necessary as the burden of collecting the information to submit to the Create and Update route will be on whoever builds the applications that consume the API. (Frontend Applications built in frameworks)

## Building an API

### Setup

- Must have nodeJS installed

- create an empty folder and navigate terminal into it

- create a server.js file and create an npm project `touch server.js && npm init -y`

Since we are using the standard library there is no need to install any other libraries. There are two libraries to be aware of, "http" and "https". They are pretty much the same but you use the latter for handling https connections (the things our frameworks figure out for us).

So to start our server...

server.js

```js
// Import http library
const http = require("http")
// use env variable to define port with default
const PORT = process.env.PORT || 4000

//create our server object
const server = http.createServer()

// get the server to start listening
server.listen(PORT, err => {
  // error checking
  err ? console.error(err) : console.log(`listening on port ${PORT}`)
})
```

If you run the server (`node server.js`) and go to localhost:4000 it just hangs cause we have no instructions built into our server to handle the incoming request. Essentially our server will pass the request details to a function for every request. So the next step is to create the function that will handle EVERY request.

There is two approaches:

#### The Event Based Approach

```js
// Import http library
const http = require("http")
// use env variable to define port with default
const PORT = process.env.PORT || 4000

//create our server object
const server = http.createServer()

// We define a function that runs in response to the request event
server.on("request", (request, response) => {
  // handle request based on method then URL
  switch (request.method) {
    case "GET":
      switch (request.url) {
        // response for unexpected get requests
        default:
          response.statusCode = 400
          response.write(`CANNOT GET ${request.url}`)
          response.end()
      }
      break

    case "POST":
      break

    case "PUT":
      break

    case "DELETE":
      break

    default:
      // Send response for requests with no other response
      response.statusCode = 400
      response.write("No Response")
      response.end()
  }
})

// get the server to start listening
server.listen(PORT, err => {
  // error checking
  err ? console.error(err) : console.log(`listening on port ${PORT}`)
})
```

#### The Callback Approach

You could also pass this function as a callback to the createServer function.

```js
// Import http library
const http = require("http")
// use env variable to define port with default
const PORT = process.env.PORT || 4000

//create our server object, pass server function as callback argument
const server = http.createServer((request, response) => {
  // handle request based on method then URL
  switch (request.method) {
    case "GET":
      switch (request.url) {
        // response for unexpected get requests
        default:
          response.statusCode = 400
          response.write(`CANNOT GET ${request.url}`)
          response.end
      }
      break

    case "POST":
      break

    case "PUT":
      break

    case "DELETE":
      break

    default:
      // Send response for requests with no other response
      response.statusCode = 400
      response.write("No Response")
      response.end()
  }
})

// get the server to start listening
server.listen(PORT, err => {
  // error checking
  err ? console.error(err) : console.log(`listening on port ${PORT}`)
})
```

Now you can handle the request in infinite ways. The way I'm doing it is a switch statement based on the method followed by more switch statements based on url. This is the kind of thing that would already be handled by Koa/Fastify/Express's routing logic. Another issue is we won't have URL params since that isn't build into node, that is done by some string/url parsing magic in our favorite frameworks which we could try to replicate but we won't to keep this exercise manageable to understand.

## Let's Simplify This

Having a bunch of switches inside of switches may get a little harder to read, so let's break out all the sub-switches into their own functions in another file.

- `touch get.js post.js put.js delete.js`

get.js

```js
module.exports = (request, response) => {
  switch (request.url) {
    // response for unexpected get requests
    default:
      response.statusCode = 400
      response.write(`CANNOT GET ${request.url}`)
      response.end()
  }
}
```

post.js

```js
module.exports = (request, response) => {
  switch (request.url) {
    // response for unexpected get requests
    default:
      response.statusCode = 400
      response.write(`CANNOT POST ${request.url}`)
      response.end()
  }
}
```

put.js

```js
module.exports = (request, response) => {
    switch(request.url){

        // response for unexpected get requests
        default:
            response.statusCode = 400
            response.write(`CANNOT PUT ${request.url}`)
            response.end()

    }
}
```

delete.js

```js
module.exports = (request, response) => {
  switch (request.url) {
    // response for unexpected get requests
    default:
      response.statusCode = 400
      response.write(`CANNOT DELETE ${request.url}`)
      response.end()
  }
}
```

Now let's import these functions into server.js and clean it up, you can think of these four files as our "routers".

server.js

```js
// Import http library
const http = require("http")
// use env variable to define port with default
const PORT = process.env.PORT || 4000

// Import our routers
const get = require("./get")
const post = require("./post")
const put = require("./put")
// add an extra R since delete is a reserved word
const deleteR = require("./delete")

//create our server object, pass server function as callback argument
const server = http.createServer((request, response) => {
  // handle request based on method then URL
  switch (request.method) {
    case "GET":
      get(request, response)
      break

    case "POST":
      post(request, response)
      break

    case "PUT":
      put(request, response)
      break

    case "DELETE":
      deleteR(request, response)
      break

    default:
      // Send response for requests with no other response
      response.statusCode = 400
      response.write("No Response")
      response.end()
  }
})

// get the server to start listening
server.listen(PORT, err => {
  // error checking
  err ? console.error(err) : console.log(`listening on port ${PORT}`)
})
```

So now all our sub-switches are handled inside the function making our server.js cleaner and easier to read.

## Our Dataset

To focus on just writing the API we aren't bringing a database, so for a dataset we will just use an array of objects. This data will not persist meaning it will reset when you reset your server, this can always be fixed later by using a database, many to choose from.

- create a file called data.js with the following

```js
module.exports = [{ title: "The first post", body: "body of the first post" }]
```

import it into server.js, we will store this array of posts in the request object so all other routes will have access to it there since they are passed the request object.

```js
// Import http library
const http = require("http")
// use env variable to define port with default
const PORT = process.env.PORT || 4000

// import data
const posts = require("./data")

// Import our routers
const get = require("./get")
const post = require("./post")
const put = require("./put")
// add an extra R since delete is a reserved word
const deleteR = require("./delete")

//create our server object, pass server function as callback argument
const server = http.createServer((request, response) => {
  // add the data to the request object so our routes can access it
  request.posts = posts

  // handle request based on method then URL
  switch (request.method) {
    case "GET":
      get(request, response)
      break

    case "POST":
      post(request, response)
      break

    case "PUT":
      put(request, response)
      break

    case "DELETE":
      deleteR(request, response)
      break

    default:
      // Send response for requests with no other response
      response.statusCode = 400
      response.write("No Response")
      response.end()
  }
})

// get the server to start listening
server.listen(PORT, err => {
  // error checking
  err ? console.error(err) : console.log(`listening on port ${PORT}`)
})
```

Ok... we've written a lot of code and haven't written really any routes yet. See why we all love Koa/Express/Fastify (or even my obscure attempt, Merver).

## Index Route

The index route is a get request to "/posts" that will return us the JSON of all the posts! We will create the route in get.js.

```js
module.exports = (request, response) => {
  switch (request.url) {
    case "/posts":
      response.statusCode = 200
      response.setHeader("Content-Type", "application/json")
      response.write(JSON.stringify(request.posts))
      response.end()
      break

    // response for unexpected get requests
    default:
      response.statusCode = 400
      response.write(`CANNOT GET ${request.url}`)
      response.end()
  }
}
```

## The Show Route

Well, url queries and params aren't handled out of the box in the nice tidy way we are use to in Koa/Fastify/Express. Params would require some heavy engineering to pull off so we'll get by making queries available. We'll store a URL object in the request object that we can use to get queries with.

server.js

```js
// Import http library
const http = require("http");
// use env variable to define port with default
const PORT = process.env.PORT || 4000;
// import the url standard library for parsing query string
require("url")

// import data
const posts = require("./data");

// Import our routers
const get = require("./get");
const post = require("./post");
const put = require("./put");
// add an extra R since delete is a reserved word
const deleteR = require("./delete");

//create our server object, pass server function as callback argument
const server = http.createServer((request, response) => {

  // add the data to the request object so our routes can access it
  request.posts = posts

  // adding the query to the request object
  request.query = new URL(request.url, `http://${request.headers.host}`)

  // handle request based on method then URL
  switch (request.method) {
    case "GET":
      get(request, response);
      break;

    case "POST":
      post(request, response);
      break;

    case "PUT":
      put(request, response);
      break;

    case "DELETE":
      deleteR(request, response);
      break;

    default:
      // Send response for requests with no other response
      response.statusCode = 400;
      response.write("No Response");
      response.end();
  }
});

// get the server to start listening
server.listen(PORT, (err) => {
  // error checking
  err ? console.error(err) : console.log(`listening on port ${PORT}`);
});
```

now we can add the show route which gets a particular item based on an id below (id will be based via url query "?id=0").

get.js

```js
module.exports = (request, response) => {

    // remove queries from the url, turn "/posts?id=0" into "/posts"
    const url = request.url.split("?")[0]

    switch(url){

        case "/posts":
            // if the id query is present return the show result
            if (request.query.searchParams.get("id")){
                const id = request.query.searchParams.get("id")
                response.statusCode = 200
                response.setHeader("Content-Type", "application/json")
                response.write(JSON.stringify(request.posts[id]))
                response.end()
            } else {
                // else return all posts (index)
                response.statusCode = 200
                response.setHeader("Content-Type", "application/json")
                response.write(JSON.stringify(request.posts))
                response.end()
            }
            break
                
        // response for unexpected get requests
        default:
            response.statusCode = 400
            response.write(`CANNOT GET ${request.url}`)
            response.end()
            break

    }
}
```

## The Create Route

Here is where we will really miss having a framework on our side as we parse the request body. We're going to have to do what all those body parser middlewares do and work with a data stream.

- create a getBody.js with the function that'll act like a traditional middleware handling the request/response object then passing it to the next function in line.

```js
module.exports = (request, response, next) => {
    let data = []

    // assemble stream of data from request body
    request.on("data", dataChunk => {
        data.push(dataChunk)
    })

    request.on("end", () => {
        request.body = Buffer.concat(data).toString()
        if (request.headers["content-type"] === "application/json"){
            
            request.body = JSON.parse(request.body)
        }

        // move on to next step in handling respone
        next(request, response)
    })
}
```

Now let's wrap our routing functions with this bodyParsing middleware in server.js

server.js

```js
// Import http library
const http = require("http");
// use env variable to define port with default
const PORT = process.env.PORT || 4000;
// import the url standard library for parsing query string
require("url")

// import data
const posts = require("./data");

// Import our routers
const get = require("./get");
const post = require("./post");
const put = require("./put");
// add an extra R since delete is a reserved word
const deleteR = require("./delete");
// require function to parse body
const getBody = require("./getBody")

//create our server object, pass server function as callback argument
const server = http.createServer((request, response) => {

  // add the data to the request object so our routes can access it
  request.posts = posts

  // adding the query to the request object
  request.query = new URL(request.url, `http://${request.headers.host}`)

  // handle request based on method then URL
  switch (request.method) {
    case "GET":
      getBody(request, response, get);
      break;

    case "POST":
      getBody(request, response, post);
      break;

    case "PUT":
        getBody(request, response, put);
      break;

    case "DELETE":
        getBody(request, response, deleteR);
      break;

    default:
      // Send response for requests with no other response
      response.statusCode = 400;
      response.write("No Response");
      response.end();
  }
});

// get the server to start listening
server.listen(PORT, (err) => {
  // error checking
  err ? console.error(err) : console.log(`listening on port ${PORT}`);
});
```

so now, regardless of method it will parse the body before passing the request and response to our routing functions. Now let's make our create route which will allow us to send a json body via post request to "/posts". You will need a tool like postman or insomnia to test this route.

post.js

```js
module.exports = (request, response) => {
  switch (request.url) {
    case "/posts":
      request.posts.push(request.body);
      response.statusCode = 200;
      response.setHeader("Content-Type", "application/json");
      response.write(JSON.stringify(request.posts));
      response.end();
      break;

    // response for unexpected get requests
    default:
      response.statusCode = 400;
      response.write(`CANNOT POST ${request.url}`);
      response.end();
  }
};
```

## Update Route

So we will use a url query again to specify id/index of the item to be updated. So in this case a put request to "/posts?id=x" will use the request body to update that object.

Since we already solved for url queries and the request body we just need to add the case to our put router function.

```js
module.exports = (request, response) => {

    // remove queries from the url, turn "/posts?id=0" into "/posts"
    const url = request.url.split("?")[0]

    switch(url){

        case "/posts":
            const id = request.query.searchParams.get("id")
            response.statusCode = 200
            response.setHeader("Content-Type", "application/json")
            request.posts[id] = request.body
            response.write(JSON.stringify(request.posts[id]))
            response.end()
            break
                
        // response for unexpected get requests
        default:
            response.statusCode = 400
            response.write(`CANNOT PUT ${request.url}`)
            response.end()
            break

    }
}
```

### Destroy Route

By making a delete request to "/posts?id=x" you should be able to delete any item from the array of posts.

delete.js

```js
module.exports = (request, response) => {
  // remove queries from the url, turn "/posts?id=0" into "/posts"
  const url = request.url.split("?")[0];

  switch (url) {
    case "/posts":
      const id = request.query.searchParams.get("id");
      response.statusCode = 200;
      response.setHeader("Content-Type", "application/json");
      request.posts.splice(id, 1);
      response.write(JSON.stringify(request.posts));
      response.end();
      break;

    // response for unexpected get requests
    default:
      response.statusCode = 400;
      response.write(`CANNOT DELETE ${request.url}`);
      response.end();
      break;
  }
};
```

## Conclusion

Well, we created a very crude full crud json api using raw node and no frameworks like Express, KOA, or Fastify or any of the robust frameworks built on top of them. We would still need to handle a lot more to get to the same level of basic functionaltiy.

- creating routing params
- setting up cors headers
- being able to parse urlEncoded or XML bodies

So while I doubt you'll be making a raw api like this again anytime soon. I hope having done this has given you a deeper appreciation for the abstractions and patterns you'll find in express, koa and fastify.