---
title: Javscript Events - In the Browser and Node
date: "2020-09-12T22:12:03.284Z"
description: "A Comprehensive Guide to Javascript Events"
---

## What are Events

Javascript events are a great way controlling "when" certain processes are run. The essential workflow of event is the following.

- a listener is created that takes an event name (ex. "click") and an event handler (a function to be run when the event occurs).

- something happens that causes and event by that name to be emitted/triggered

- listeners are iterated over and if a listener is attached to an event of the same name, the function is run.

In this post I want to discuss...

- Built in browser event (DOM Events)

- Custom Browser Events

- Custom Events in Node

## Built in Browser Events

There are dozens of built-events that occur when browsing a website; clicks, hovers, etc. Any individual element in the browser can listen for these events. To do so we have to create a listener to listen to the event.

```js
// Grab first button and save it in a variable
const button = document.querySelector("button")

//Add an listener to respond to clicks
button.addEventListener("click", event => {
  console.log("I happen when you click on the button")
})
```

That's it, that function will now run whenever I click on that button. You may notice I placed one parameter in the function definition called "event", this is cause every event handler function is automatically passed one argument, an object with all the details regarding the event.

This object is called the event object and has a lot of several useful support functions and properties.

```js
// Grab first button and save it in a variable
const button = document.querySelector("button")

//Add an listener to respond to clicks
button.addEventListener("click", event => {
  // This gives us the element that this event belongs to
  console.log(event.currentTarget)

  //This gives us the element that initiated the event which may be different if this particular event was triggered by an interaction of a child element, this property would contain the child element.
  console.log(event.target)

  // This function prevents bubbling, means an event emitted/triggered on a child element will not trigger events on the parents. (A click event on a button won't trigger a click event on the div its inside in, which would normally occur)
  event.stopPropagation()

  // This function would prevent any elements default behavior. This is primarily useful when submitting a form as by default forms refresh on every submit.
  event.preventDefault()

  // You can pull any information from the target element making it useful to store information in the element via attributes to be used in events.
  console.log(event.currentTarget.id) //the ID of the target element
  console.log(event.currentTarget.getAttribute("info")) //grab value of an "info" attribute
})
```

That's pretty much how built in events work and they can be very powerful. We can take it to the next level with custom events...

## Custom Events in the Browser

Javascript being a backend and frontend language gives it the unique position of having two different APIs for most features, a browser API built for DOM interactions on a web page and the nodeJS API built for processes outside of the browser (building servers, scripts, web scraping).

In the browser there are two ways to build custom events and it really just depends whether you wanted to include any additional information to the event object.

### The Simple Way

We just create an event and then our DOM element can start listening for it.

```js
//Create the Event
const myEvent = new Event("hug")

//Now it can be listened for
const teddyBearPhoto = document.querySelector("img#teddyBearPhoto")
teddyBearPhoto.addEventListener("hug", event => {
  alert("not so hard")
})

//The Event can be emitted/dispatched/triggered
const theBearHasBeenHugged = event => {
  teddyBearPhoto.dispatchEvent(myEvent)
}
```

The event object would still be passed to this custom event with all the info we are used to having in the event. This can be used for triggering events that should happen under unique circumstances.

## The Slightly Less Simple Way

Maybe you want to include some custom information inside the event object. The syntax below allows use to add info to the event object.

```js
//Create the Event
const myEvent = new CustomEvent("hug", { detail: "not so hard" })

//Now it can be listened for
const teddyBearPhoto = document.querySelector("img#teddyBearPhoto")
teddyBearPhoto.addEventListener("hug", event => {
  alert(event.detail)
})

//The Event can be emitted/dispatched/triggered
const theBearHasBeenHugged = event => {
  teddyBearPhoto.dispatchEvent(myEvent)
}
```

The detail property in the second argument of CustomEvent allow us to pass more information in. If you want to pass a lot of information detail could be an object or an array. The second argument is object cause there are other properties you can specify on how the event behavior such as...

- **bubbles:** a boolean on whether the event bubbles or not

- **composed:** a boolean on whether the event bubbles through a shadowDOM

So that's the world of custom events in the browser!

## Custom Events in NodeJS

Outside of the browser Javascript lives in the world of NodeJS. In node there is a built-in events library that allows us to create custom event which is heavily used in many of the libraries you know and love. See the example below...

```js
//Bring in the events library
const events = require("events")

//create a new event emitter
const emitter = new events.EventEmitter()

//listen for a particular event
emitter.on("itHappened", obj => {
  console.log("I'm responded to the emitted event")
  console.log(obj.message)
})

//emit the event
emitter.emit("itHappened", {
  message:
    "Hello, I'm an argument passed during the event to the event handler",
})
```

Cool thing is that we can pass data when the event is emitted. Any arguments to the emit function after the first one are passed to event handlers in that order. Although, it's probably simpler to pass one argument as an object with any data those responding to the event should need.

#### When to use events

- To signal when certain things have occured or ending
- To trigger the resolution of a promise (run the resolve function when an event is emitted)
- To signal open and closed connections (you see this a lot in database libraries)
- To signal errors
- Any reason you can imagine, be creative
