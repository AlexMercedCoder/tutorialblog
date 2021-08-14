---
title: Ultimate Plain Vanilla DOM JS & JQuery Cheatsheet
date: "2021-08-04T14:12:03.284Z"
description: A Beginning oriented dive into databases
---

While for larger projects using one of the main frontend frameworks is usually the way to go:

- React
- Angular
- Vue
- Svelte
- SolidJS
- RiotJS
- Mithril
- lit-html
- Stencil
- Alpine
- HTMX

Or even reaching for a transpile to JS language like Typescript, ELM or ReScript for doing the job, but again this really is for larger projects that need the code structure.

There is still plenty of projects where that is overkill and you just want to splash some basic DOM manipulation either with plain vanilla JS or with jQuery. This cheatsheet should help be a quick reference when that is the case.

[Watch my DOM Masterclass Video](https://youtu.be/417t4ZotBlI)
[Browser and Keyboard Events](https://youtu.be/fgxS3XLDt08)
[Javascript Events Masterclass](https://youtu.be/DEjkFl8bd-k)

## Enabling

#### Plain Vanilla

You don't need to do anything, the native DOM api is built into the browser and available to all your javascript code without doing anything special.

#### jQuery

You just need to add the jQuery script tag which you can get at code.jquery.com.

If you want everything jQuery has to offer including fun animation functions then use the latest minified script tag:

```html
<script
  src="https://code.jquery.com/jquery-3.6.0.min.js"
  integrity="sha256-/xUj+3OJU5yExlq6GSYGSHk7tPXikynS7ogEvDej/m4="
  crossorigin="anonymous"
></script>
```

If you just want the basic DOM features that allow you to select, create and manipulate the DOM then use the latest minified slim version:

```html
<script
  src="https://code.jquery.com/jquery-3.6.0.slim.min.js"
  integrity="sha256-u7e5khyithlIdTpu22PHhENmPcRdFiHRjhAuHcs05RI="
  crossorigin="anonymous"
></script>
```

## Loading your External Javascript File

So if you use an external javascript file you need to be careful cause the javascript may run before all your html nodes have been rendered causing your code not to run correct. You can deal with this in one of three ways.

1. Add you script tag to the bottom of the body

I personally don't like this cause I like having all my non-ui stuff in my head tag, but to each their own.

```html
<body>
  <main>Some Content</main>
  <script src="script.js"></script>
</body>
```

2. You can use an event listener to run the code after the DOM has finished loading.

The window object built into the browser has a onLoad event you can listen for. jQuery has a special ways of working from this event to reduce boilerplate but not by much. Either way, this will allow you to house your script tag inside the head tag.

#### Plain Vanilla

```js
window.addEventListener("load", () => {
  // all your DOM code goes here
})
```

#### jQuery

```js
$(() => {
  // all your DOM code goes here
})
```

3. Use the defer keyword

By far the simplest way to do things, just add the defer keyword in your script tag and it has the same effect as onLoad event.

```html
<head>
  <script src="script.js" defer></script>
</head>
```

## Selecting Elements

Well to manipulate the DOM we need to be able select and target the different nodes (the html elements) on the page. Selecting them will often rely on your knowledge of css selector so let's have a quick review.

- selecting an h1 in css => `h1`
- selecting an element with the class "cheese" in css => `.cheese`
- selecting an element with the id "cheese" in css => `#cheese`
- selecting an element with a type attribute of "text" in css => `[type=text]`

There are endless more ways to select elements in CSS but this should get you by traversing the DOM.

#### Plain Vanilla

While JS has many other methods for selecting elements all your really need is `querySelector` and `querySelectorAll`

- querySelector will grab the first element that matches the css selector passed, you can then store this DOMNode in a variable for further manipulation.

```js
// Saving a div with the class of "cheese" in a variable
const div = document.querySelector("div.cheese")
```

- querySelectorAll returns an array of all DOMNodes that match the css selector.

```js
// Saving all divs in a variable
const divs = document.querySelectorAll("div")
```

#### jQuery

jQuery does this just a tiny bit different. The `$()` function which we will refer to as the jQuery function will always return a jQuery Collection object with all nodes that match the css selector.

What's neat about this is all the jQuery manipulation methods manipulate all nodes in a jQuery collection so if you get back 1 or 100 elements, it makes easy to manipulate all of them at the same time.

When querying the dom, it's convention to prefix variable names that will store a jQuery collection object with a \$.

```js
// Saving a div with the class of "cheese" in a variable
const $div = $("div.cheese")

// Saving all divs in a variable
const $divs = $("div")
```

## Manipulating Nodes

Whether you have a single DOMNode (div) or a jQuery collection (\$div) you'll now be able to manipulate it in many ways. The following chart shows you the many ways to manipulate the element you have stored in a variable.

| Action                       | DOMNode (Plain Vanilla)               | jQuery Collection (jQuery)             |
| ---------------------------- | ------------------------------------- | -------------------------------------- |
| Change The Text\*            | `div.innerText = "new text"`          | `$div.text("new text")`                |
| Change The HTML\*            | `div.innerHTML = "<h1>new text</h1>"` | `$div.html("<h1>new text</h1>")`       |
| Empty an Element             | `div.innerHTML = ""`                  | `$div.empty()`                         |
| Add a CSS class              | `div.classList.add("cheese")`         | `$div.addClass("cheese")`              |
| Remove a CSS class           | `div.classList.remove("cheese")`      | `$div.removeClass("cheese")`           |
| Toggle a CSS class           | `div.classList.toggle("cheese")`      | `$div.toggleClass("cheese")`           |
| Change a CSS Style\*\*       | `div.style.backgroundColor = "black"` | `$div.css("background-color","black")` |
| Retrieve an Attributes Value | `div.getAttribute("id")`              | `$div.attr("id")`                      |
| Change an Attributes Value   | `div.setAttribute("id", "cheese")`    | `$div.attr("id", "cheese")`            |

- if you don't pass an argument to the jQuery text or html function it'll return the current value of innerText or innerHTML

\*\* In javascript all the style properties names are camel case, so "background-color" becomes "backgroundColor"

## Creating Nodes

Now creating a new DOM nodes requires several steps

- creating the node
- adding an text/html, styling, attributes to it
- appending or prepending it to the DOM

The node will not be visible till it has been attached somewhere(prepend/append)

#### Plain Vanilla

Below is an example of creating a div, adding some html to it and an id, then appending it to the body tag so it can be visible.

```js
// Create the Div Element
const div = document.createElement("div")
// add some html to the div
div.innerHTML = "<h1>Hello World</h1><img src='pic.jpg'>"
// add an id to the div
div.setAttribute("id", "newdiv")
// appending to the body
document.querySelector("body").append(div)
```

#### jQuery

With jquery we still use the same `$()` jquery function, but instead of passing it a css selector you pass it an element you want to create along with angle brackets `$("<h1>")` and it'll return a jQUery collection with the newly created node!

```js
// Create the Div Element
const $div = $("<div>")
// add some html to the div
$div.html("<h1>Hello World</h1><img src='pic.jpg'>")
// add an id to the div
$div.attr("id", "newdiv")
// appending to the body
$("body").append($div)
```

## Events

Want something to happen when you click a button, events. Want something to happen when a form is submitted, events. The browsers "emits" several events everytime the user interacts with the website we create listeners that listen for these events. When a listen detects the desired effect it'll trigger a function that was scheduled to run.

The Flow:

- Add listener for a "click" event on a button, assign it a function
- When button is clicked, function is executed

#### Adding an Remove Event Listeners

| Action                         | DOMNode (Plain Vanilla)                                 | jQuery Collection (jQuery)                 |
| ------------------------------ | ------------------------------------------------------- | ------------------------------------------ |
| Assigning an event listener    | `div.addEventListener("click", (e) => {console.log(e)}` | `div.on("click", (e) => {console.log(e)}`) |
| Removing all event listeners\* | `div.parentNode.replaceChild(div.cloneNode(true), div)` | `div.off()`                                |

- There really isn't a good built in way to remove all event listeners, so the path of least resistance in plain vanilla is to replace the node with a copy of itself that doesn't have any listeners. jQuerys off method makes this muuuuch simpler.

#### The Event Object

The function that is triggered by the event only receives one argument, the event object (you saw it represented as `e` in the sample code the previous section.)

So this begs two questions:

- How do I pass other arguments other than the event object?

To do this just define another function that takes the additional arguments and define it inside your event handler. Refer to the following example.

```js
const data = "some data we want to pass"

const innerFunc = (event, otherArgument) => {
  // all your logic here
}

// pass a function that calls innerFunc as the event handler, pass it the event and another argument
div.addEventListener("click", event => {
  innerFunc(event, data)
})
```

- What is the event object?

The event object is an object that contains an endless amount of data about the event such as:

1. event.preventDefault(): a function that prevents for submissions from refreshing the page

1. event.stopPropagation(): prevent event bubbling, for example, if I click a button it won't trigger a click event in the div it's inside of as well.

1. event.target: The thing that triggered the event, usually a DOMNode

1. several booleans detailing whether alt/shift/control keys were pressed when the event was triggered

1. The list goes on and on I recommend logging the event objects and exploring it for a bit!

#### Event Types

There are several event types but some of the most popular ones:

- "click" when something is clicked
- "submit" when a submit input is pushed inside a form element
- "keyDown" when you push down a key
- "keyUp" when you release a key
- "load" when the dom is done loading
- "error" an event when a resource errors, used to replace broken images with a default image

[For an Exaustive List of Event Types](https://developer.mozilla.org/en-US/docs/Web/Events)

## Forms

Form elements have inputs inside of them and there are several types of inputs:

[List of Input Types](https://www.w3schools.com/html/html_form_input_types.asp)

A few footnotes to keep in mind:

- for more inputs you need to get their data from the value property
- for checkboxes they have a "checked" property that determines whether they are true or false
- The value of a select input is the value of the option tag currently selected

| Action                        | DOMNode (Plain Vanilla) | jQuery Collection (jQuery) |
| ----------------------------- | ----------------------- | -------------------------- |
| Getting the value of an input | `input.value`           | `$input.val()`             |
| Setting the value of an input | `input.value = ""`      | `$input.val("")`           |
