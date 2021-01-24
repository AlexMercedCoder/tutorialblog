---
title: Understanding Dependency Injection
date: "2021-01-24T12:12:03.284Z"
description: What a Fancy Word
---

- [Watch My Video Explanation](https://youtu.be/qGVJVqHNTNo)

## The Basic Idea

Dependency Injection is one of those programming concepts that are quite simple, yet seems so complicated when you first encounter it. Often times this confusion is more a sign of not yet being comfortable enough with the core Object-Oriented Programming and such. But here is the basic idea:

- When you create an object it only has the properties and methods it always needs, nothing extra

- The object has a built-in mechanism by which to extend when needed. These new functionalities are "dependencies" that need to be "injected" as the use of these features is dependant on their injection.

## An Example

Let's pretend we are building our own web framework, the core thing that every framework must do is kickstart a new server that listens on an HTTP port. So imagine the following.

```js

// Web Server Class

class WebServer {

  //Constructor takes one argument, an object with several properties including port
  constructor(config = {port: 3000}) {
    this.port = config.port;
  }

  //function to theoretically kickoff server listener
  listen() {
    console.log(`listening on port ${this.port}`);
  }
}

// Create New Instance of Web Server
const app = new WebServer({port: 4000});

// Server Starts Listening
app.listen()

```
*note, there isn't any real functionality, just logs to symbolize where functionality would be*

Now right now all this object can do is listen, there is no way for us to declare routes, connect to databases, or any of the things we'd expect a web framework to allow us to do, nor is there a way for us to inject these features in a uniform way.

**The Benefit of a built-in dependency injection mechanism is third party libraries can all behave in a uniform predictable way making it easier for the developer to add and subtract pieces from project to project*

## The Mechanism

The mechanism doesn't need any particular design but we're going to ask the user to pass in an array of functions that will inject the functionality needed. Here is how our class looks now.

```js
class WebServer {
  constructor(
    config = {
      port: 3000,
      deps: [],
    }
  ) {
    this.port = config.port;
    // loops over each dependency and passes the instance to the function so it can add any methods or properties for that features set
    config.deps.forEach((dep) => {
      dep(this);
    });
  }

  listen() {
    console.log(`listening on port ${this.port}`);
  }
}

```

So now let's say third party libraries defined the following dependencies:

```js
// Mock injection of routing function
const routeInject = (server) => {
    server.get = () => console.log('this is a get route')
    server.put = () => console.log('this is a put route')
    server.post = () => console.log('this is a post route')
    server.delete = () => console.log('this is a delete route')
}

// Mock injection of postgres database functions
const pgInject = (server) => {
    server.pgConnect = () => console.log('connected to db')
    server.query = () => console.log('query database')
}

```

So now when I create my server I can inject them through the dependency array in the config object.

```js

const app = new WebServer({
  port: 4000,
  // I add any injection functions in the deps array, they get to run in the constructor adding the methods to the instance of the web server
  deps: [routeInject, pgInject]
});

// Using the methods granted from the injection of postgres features
app.pgConnect()
app.query()

// Using the methods granted from the injection of router features
app.get()
app.post()

// The original listen methods all instances of WebServer have
app.listen();

```

In this pattern, I can add as few or as many dependencies as I want. The benefit is I don't have to have unused methods and properties in my object I don't need. This saves memory allowing my code to be more performant and declarative (since I declare my dependencies, much easier to look back at my code and know what I'm using).

Also, this allows one framework or class to be extended for infinite use cases as long as someone is willing to create an injector of that feature set.