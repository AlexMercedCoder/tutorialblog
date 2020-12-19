---
title: Promises 101  and Fetch, Axios and $.ajax
date: "2020-09-17T22:12:03.284Z"
description: Asynchronous Javascript in Nutshell
---

## What is the problem?

When working with web applications in particular, the procedures your code executes can't all be done in a set order because so much of your data often depends on external sources. Those external sources may differ on how fast or slow they get you data needed for your application.

Javascript by default is "Synchronous", a single javascript program is one process executing procedures sequentially. So dealing with the issue of asynchronous data in synchronous code has always been a fun adventure in javascript.

**Original Solution:** Developers would create functions that did their asynchronous task and build a callback function that would be executed at a later time. But often you may be running several Asynchronous tasks and this would result in callbacks in callbacks. This was referred to as callback hell.

```js
myfunction(() => {
  console.log("this is a callback function")
  myfunction(() => {
    console.log("this is a callback function")
    myfunction(() => {
      console.log("this is a callback function")
      myfunction(() => {
        console.log("this is a callback function")
        myfunction(() => {
          console.log("this is a callback function")
        })
      })
    })
  })
})
```

## Enter Promises

Eventually they added promises to javascript which are objects that have three types of status...

- pending
- resolved
- error

Nothing would happen while the promise is pending but when the promise is resolved you can pass a callback to a .then function on what happens with the data returned or a .catch which handles an error situation.

```js
const promise1 = functionThatReturnsPromise()

promise1
  .then(data => {
    console.log("I run when the promise resolves")
    console.log("the promise returned: ", data)
  })
  .catch(err => {
    console.log("I run when the promise fails")
    console.log("This is the error: ", err)
  })
```

What if you had multiple concurrent promises and you didn't want to do anything till they all resolved, they got you!

```js
const allPromises = Promise.all([promise1, promise2, promise3])

allPromises
  .then(data => {
    console.log("I run when all promises resolves")
    console.log("the promise returned: ", data)
  })
  .catch(err => {
    console.log("I run when if any of the promises fail")
    console.log("This is the error: ", err)
  })
```

This is certainly an improvement over callback hell.

## When Do you use promises

Probably the most typical time you'll find yourself working with promises is when you make API calls. So let's go over three ways to make API calls.

### Fetch

We'll go over fetch first since this is built into the browser and doesn't require the loading of any third party library (although, it would for node).

Fetch makes a request and returns a promise.

When the promise resolves it returns a buffer object with which you can run several functions which also return a promise and resolve into something useful (typically you'll use buffer.json() to get convert json data in a JS Object)

```js
// We run fetch, a promise is returned
const request = fetch("https://jsonplaceholder.typicode.com/posts/1")

//When resolved, we'll run the function to convert the buffer
const response = request.then(res => res.json())

//Then we can use the json data as we wish
response.then(data => {
  console.log(data)
})
```

Notice, I've been saving the promises in variables to make the code easier to read. Conventionally we chain the .then into something like this...

```js
// We run fetch, a promise is returned
const request = fetch("https://jsonplaceholder.typicode.com/posts/1")
  .then(res => res.json()) // We convert the buffer
  .then(data => {
    //Do stuff with the data
    console.log(data)
  })
```

Storing the promises in variables isn't optimal cause the promises may stick around in memory if the variable is global, but chaining all the .then together can become just as ugly as callback hell. This is why they eventually introduced the async/await syntax which is just a cleaner syntax with two keywords.

async - denotes that this function is asynchronous to enable the await keyword
await - stop the function until the following promise resolves

The only catch is we have to use async/await currently in a function for the browser and node (top level await is available in Deno). So the same code as above would be written as follows.

```js
const getData = async () => {
  // We run fetch, a promise is returned
  const response = await fetch("https://jsonplaceholder.typicode.com/posts/1")
  // we convert the buffer
  const data = await response.json()
  // We can use the data
  console.log(data)
}

getData()
```

Isn't this a lot nicer looking! So when we use await we aren't assigning the promise to the variable but the resolved value, the function stalls until the promise resolves (so the code will continue executing everything after your function while the function waits for the promise to resolve, keep this in mind, it only stalls the function not the whole process.)

### \$.ajax

The \$.ajax function is popular when using the jQuery library as it is included. Many moved away from jQuery cause the library became large but nowadays jQuery has a slim version with just the DOM functions (code.jquery.com) and if you use tree shaking with Rollup and Webpack, these bundlers can filter out unused parts of a library in a final build so there is no cost (So now you can use the full jQuery and lodash guilt free).

Here is how the request we did with fetch would look like with \$.ajax

```js
const getData = async () => {
  // We run $.ajax, a promise is returned
  const data = await $.ajax({
    url: "https://jsonplaceholder.typicode.com/posts/1",
  })
  // We can use the data
  console.log(data.data)
}

getData()
```

### Axios

Axios existed before fetch when people wanted a solution independent of jquery and became a very popular solution for a simple way to make API calls.

Below is how Axios would work with the previous calls.

```js
const getData = async () => {
  // We run axios, a promise is returned
  const data = await axios({
    url: "https://jsonplaceholder.typicode.com/posts/1",
  })
  // We can use the data
  console.log(data.data)
}

getData()
```

Notice that we log data.data instead of just data. This is cause Axios gives us back an object with plenty of other possibly useful data and tucks the response in that objects data property.

## In conclusion

Hopefully this helps understand the basic functioning of promises and how to use different functions to make Asynchronus AJAX Requests. In a future post I'll discuss how to create your own custom promises.
