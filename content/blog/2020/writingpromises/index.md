---
title: Writing Javascript Promises
date: "2020-09-25T22:12:03.284Z"
description: Under the Hood of Asynchronous Javascript
---

To read my previous article explaining promises, go here:
https://tuts.alexmercedcoder.dev/2020/promises/

## Building a Promise

So if you read my previous article we learned what promises are and how to work with them when functions like fetch and axios return them to us. In this article I'll show you how to write your own promise.

### Why Write Promise

Basically if all the following questions get a yes response, you should write a promise.

- I have something that must be done only when something else is complete
- I don't want the rest of my code sit and wait for that something else to finish

This is exactly the situation that promises allow us to accommodate.

### Writing a basic promise

```js
const myPromise = new Promise((resolve, reject) => {
  setTimeout(() => {
    if (true) {
      resolve("The Promise has resolved")
    } else {
      reject("your promise has failed")
    }
  }, 3000)
})

myPromise
  .then(value => console.log(value))
  .catch(err => console.log(err))
  .finally(() => console.log("Either Way I happen"))
```

So what happened above?

1. We create a new variable myPromise
2. We assign a new Promise to the variables
3. The Promise constructor is passed a function
4. The promise function is always passed resolve/reject (I sometimes name them done/fail), which are function to determine when the promise ends.
5. setTimeout is set to run a function in 3 seconds (3000 milliseconds)
6. At the end of timeout an if statement is evaluated
7. If evaluates true the resolve function invokes sending a string value as the promises value, this would then allow any .then calls on this promise to execute
8. If evaluates false, the reject function invokes passing an error message which causes any .catch calls on this promise to get the error and execute
9. Whether the promise succeeds or fails, any .finally calls will be executed

**Test above code again except change if (true) to if (false) and see how the results change**

That's it, wrap any code whose completing should trigger other code in a promise and enjoy the world of asynchronous javascript.

## Things to keep in mind

- .then calls return a promise, so they can return a value which gets passed to any .then calls chained to that .then. (promise.then().then().then())

- Technically your code is still synchronous (a single process), what promises do is just allow the event loop to continue as an the event loop it'll evaluates the promises status on each loop. If the status is pending, the loop just continues executing other code, if resolved .then calls will then be executed, if reject then .catch calls will be executed.

- Typically under the hood of things like fetch and mongoose are event emitters that emit events when http connections are made or streams are running, and it's these events that may tell the promise to be resolved. Read my article on javascript events: https://tuts.alexmercedcoder.dev/2020/jsevents/
