---
title: Frontend Javascript Ajax/Http Request Guide
date: "2021-08-25T12:12:03.284Z"
description: Getting Data from an external API
---

## What is AJAX?

AJAX stands for (Asynchronous Javascript and XML) which is a throw back term when XML was the standard way to send data across the web. JSON (Javascript Object Notation) is now the standard but AJAX is still used as the term for features that allow browser run javascript to make requests to the web beyond clicks on anchor tags or submissions on a form (there was a time this was not a feature, how far we have come!)

** XML **

```html
<users>
  <user>
    <name>
      Alex Merced
    </name>
    <age>
      36
    </age>
  </user>
  <user>
    <name>
      Bob Smith
    </name>
    <age>
      55
    </age>
  </user>
</users>
```

\*\* The same data set represented as JSON

```JSON
[
  {"name": "Alex Merced", "age": 36},
  {"name": "Bob Smith", "age": 55}
]
```

You may notice JSON uses less charachters and is much easier to read, so it isn't hard to imagine how JSON supplanted XML as the standard.

## What's an API

API (Application Programming Interface) can mean many things but in the context of making AJAX requests an API refers to applications that don't neccessarily respond with the traditional HTML but instead respond to requests with data typically in JSON format.

We will be using [JSON Placeholder](https://jsonplaceholder.typicode.com/) for today's exercise as they provide serveal "practice" API for practicing making AJAX requests.

After practicing a little try building some basic applications with free public API's.

- [List of Free Public APIs](https://mixedanalytics.com/blog/list-actually-free-open-no-auth-needed-apis/)

Or you can create your own data and have an API made from it using a Headless CMS!

- [List of Headless CMS services with a free tier](https://tuts.alexmercedcoder.dev/2021/1/freeheadless/)

## What's a Promise

We will be discussing three functions that are commonly used for this purpose, all of these functions return an object that is called a Promise. So before we use these functions let's discuss how promises work.

A promise is an object that lives up its name, it represents a "promise" that some data will eventually be available. Every promise initially begins in a "pending" state which allows code after the promise to run and then checks in later if the state of the promise has changed. This is known as your code running "Asynchronously" (Out of Order or in Parallel)

What if we have code that we want to run when promise is no longer pending (resolved or error), how would we write this in javascript. A promise has three methods to provide a function that should only run in a certain situation.

- `.then((data) => {})` The function given to this method runs when the promise is resolved and is passed the data from the resolved promise as an argument.

- `.catch((error) => {})` The function given to this method runs if the promise is rejected and is an error state, it is passed the error

- `.finally(() => {})` This function runs whether the promise resolves or is rejected

some illustrative code...

```js
const theReturnedPromise = functionThatReturnsAPromise()

theReturnedPromise
  .then(data => {
    console.log(`The Promise resolved and gave me ${data}`)
  })
  .catch(error => {
    console.log(`The Promise failed and the error is ${error}`)
  })
  .finally(() => {
    console.log("I run whether the promise succeeds or fails")
  })

console.log(
  "This line of code is synchronous so it'll run before all the above has a chance to"
)
```

In the above snippet we saved the promise to variable, but typically we developers don't do that and instead just chain the methods of the return value of the function directly like so...

```js
console.log(
  "This line of code is synchronous so it'll run before all the above has a chance to"
)
```

#### Async/Await

Sometimes these methods can be a little messy looking so there is an alternative syntax called Async/Await. In this syntax the keyword "async" allows us to designate a function as asynchronous which automatically makes whatever it returns a promise, in which case we can use the keyword "await" in place of .then to pause the function until a promise resolved to make our code look for synchronous. This can ONLY be used in an async function.

```js
//define the async function
async function thisAsyncFunction() {
  const data = await functionThatReturnsAPromise().catch(error =>
    console.log(`The Promise failed and the error is ${error}`)
  )
  console.log(`The Promise resolved and gave me ${data}`)
}

thisAsyncFunction() // call the async function

console.log(
  "This line of code is synchronous so it'll run before all the above has a chance to"
)
```

So while that's a little clear, error handling still required us to use .catch or to wrap the code in a try/catch block. If we wanted to setup a finally scenario we would need a .finally to. So really, Async/Await really just cleans the need for a .then.

## jQuery \$.ajax

To use this function you need to add the jQuery script tag inside your html document's head tag. All these functions will do the same thing, make a request for the data to a URL we specify and then return a promise of that data.

```html
<script
  src="https://code.jquery.com/jquery-3.6.0.js"
  integrity="sha256-H+K7U5CnXl1h5ywQfKtSj8PCmoN9aaq30gDh27Xc0jk="
  crossorigin="anonymous"
></script>
```

#### Basic Use

```js
$.ajax("https://jsonplaceholder.typicode.com/users")
  .then(data => {
    console.log(`The Promise resolved and gave me:`, data)
  })
  .catch(error => {
    console.log(`The Promise failed and the error is ${error}`)
  })
  .finally(() => {
    console.log("I run whether the promise succeeds or fails")
  })
```

#### Async/Await Version (with a try/catch block for error handling)

```js
async function thisAsyncFunction(){
  try {
    const data = await $.ajax("https://jsonplaceholder.typicode.com/users")
    console.log(`The Promise resolved and gave me:`, data)
  } catch (error){
    console.log(`The Promise failed and the error is ${error}`
  }
}

thisAsyncFunction()
```

## Fetch

This function is built into the browser but comes with an extra step. The promise does not give you back the data but a response object with details of the request, to get the data you'll want to use the response objects .json methods (to get a javascript object from json data) or .text method (great for non-json data that may need some deeper work, gives you just the text version of the data).

This is always available in the browser but it does not exist in node, to use fetch in node you will have to install the `node-fetch` library.

#### Basic Use

```js
fetch("https://jsonplaceholder.typicode.com/users")
  .then(response => response.json()) // <== convert the response into a javascript object which is received by the next .then
  .then(data => {
    console.log(`The Promise resolved and gave me:`, data)
  })
  .catch(error => {
    console.log(`The Promise failed and the error is ${error}`)
  })
  .finally(() => {
    console.log("I run whether the promise succeeds or fails")
  })
```

#### Async/Await Version (with a try/catch block for error handling)

```js
async function thisAsyncFunction(){
  try {
    const response = await fetch("https://jsonplaceholder.typicode.com/users")
    const data = await response.json()
    console.log(`The Promise resolved and gave me:`, data)
  } catch (error){
    console.log(`The Promise failed and the error is ${error}`
  }
}

thisAsyncFunction()
```

## Axios

This is a popular third party library available in the frontend with a script tag and can be installed in node. The only catch with Axios is the object you get back from the promise isn't the data but a response object with the data already nested inside it within a property called data.

To use Axios just add it in your head tag.

```js
<script src="https://cdn.jsdelivr.net/npm/axios/dist/axios.min.js"></script>
```

#### Basic Use

```js
axios("https://jsonplaceholder.typicode.com/users")
  .then(response => {
    console.log(`The Promise resolved and gave me:`, response.data)
  })
  .catch(error => {
    console.log(`The Promise failed and the error is ${error}`)
  })
  .finally(() => {
    console.log("I run whether the promise succeeds or fails")
  })
```

#### Async/Await Version (with a try/catch block for error handling)

```js
async function thisAsyncFunction(){
  try {
    const response = await axios("https://jsonplaceholder.typicode.com/users")
    console.log(`The Promise resolved and gave me:`, response.data())
  } catch (error){
    console.log(`The Promise failed and the error is ${error}`
  }
}

thisAsyncFunction()
```

## Conclusion

The above should have you all ready to go in getting data from APIs around the web, if you need to make more complex requests (post, put, delete) check out this github gist where I should how to make these requests in fetch and axios.

- [Full Crud Requests in Fetch and Axios](https://gist.github.com/AlexMercedCoder/49430b0e19604f3940a45b29c27e089a)
