---
title: Ultimate jQuery/Plain Vanilla JS DOM Reference
date: "2020-09-13T22:12:03.284Z"
description: "The Basics of one of the most popular libraries ever"
---

## What is jQuery

Once upon a time the browser DOM API was a lot more verbose (wordy) and a lot less standardize between browsers causing developers a lot of pain figuring out how to create dynamic websites with cross browser capability. The hero of a the day was the jQuery library which provided a much simpler syntax for working with the DOM and took care of the compatibility issues under the hood.

Since the days of peak jQuery the browser DOM API has become better and more standard across browsers but jQuery is still one of the most heavily used libraries around. Yes, React, Angular and Vue are the frontend sweethearts of the day but it doesn't mean jQuery still doesn't play a huge role when other popular tools and frameworks are built on top of it (up until the upcoming version, bootstrap was highly dependant on jQuery).

One knock people will take is that the full jQuery library is huge, but a slim version does exist with just the main DOM manipulation tools that everyone loves. I'll be covering the use of this version today and showing you the plain vanilla javascript syntax as well, enjoy!

## Installing jQuery

All you need is the following script tag for the minified slim version of jQuery.

```js
<script
  src="https://code.jquery.com/jquery-3.5.1.slim.min.js"
  integrity="sha256-4+XzXVhsDmqanXGHaHvgh1gMQKX40OUvDEBTu8JcmNs="
  crossorigin="anonymous"
></script>
```

## Querying Elements

The first thing one should learn is how grab an existing element from the DOM (Document Object, you know... that tree of HTML elements on your page). So let's grab the body element and store it in a variable. In jQuery, functions always return a jQuery element object which is different than a what standard browser API returns so fo simplicity it's always best to stick with one path or the other.

Conventionally, variables that store jQuery element objects are pre-fixed with a \$ so we know what is inside of it is a jQuery object.

\*In both APIs elements are queried using a CSS selector, so if its a valid css selector it can be used to query the element (#myId, .myClass, tag#withID, tag.withClass)

**Plain Vanilla**

```js
const body = document.querySelector("body")
```

**jQuery**

```js
const $body = $("body")
```

You can already see the difference between the two's verbosity. Essentially think of the \$() function as jQuery's query function, it will allow us to select elements and create elements, nice.

## Creating an element

Let's create a div to put inside that element and give it a class of "style".

**Plain Vanilla**

```js
const div = document.createElement("div")
div.classList.add("style")
```

**jQuery**

```js
const $div = $("<div>").addClass("style")
```

Notice how we can chain jQuery functions quite easily. It's because all jQuery functions return the altered jQuery object making it easy to chain one function to the next.

Also, the only difference between creating and querying an element in jQuery is the use of <> in the jQuery function.

## Appending Elements

Creating an element doesn't make it visible we need to attach the newly created element to the DOM in some way, typically it is appended or prepended to an existing DOM node. We will attach the div we created to the body tag.

**Plain Vanilla**

```js
const body = document.querySelector("body")
const div = document.createElement("div")
div.classList.add("style")
body.appendChild(div)
```

**jQuery**

```js
const $body = $("body")
const $div = $("<div>").addClass("style")
$body.append($div)
```

## Grabbing Multiple elements and accessing them

Sometimes you need to grab several elements, like all the `<li>` in a list.

Our List

```html
<ul>
  <li>Cheese</li>
  <li>Meat</li>
  <li>Vegetables</li>
</ul>
```

**Plain Vanilla**

```js
const liArray = document.querySelectorAll("li")
console.log(liArray[0])
```

**jQuery**

```js
const $liArray = $("li")
console.log($liArray.eq(0))
```

Two things to notice in jQuery

- You query an array of elements it is the same as querying one element. If more than one element matches the query the jQuery function will automatically return an array of jQuery objects.

- Accessing the element in the jQuery array can't be done with the typical square bracket array method, so you have to chain the eq method and pass the index to grab the desired element.

## Looping over an array of elements

Let's say we have several `<li>` elements that we'd like to loop over and add an id too each element let's take a look at how we would do that. jQuery has it's own method for iterating over arrays of jQuery objects.

**Plain Vanilla**

```js
liArray.forEach((li, index) => {
  li.id = index
})
```

**jQuery**

```js
const $liArray = $("li")
$liArray.each(function (index) {
  $li = $(this)
  $li.attr("id", index)
})
```

Notice to get the individual element as jQuery objects we have to write the callback using function(){} syntax and pass this into the jQuery Function.

## Using Functions to Make Update DOM

Let's say we have a list where all the li tags are made based on an array. That list may change (like in a todo list where someone adds a todo), we can make updating that list easy with a function that repeats building array. The function below takes the target ul/ol tag and an array and populates the li tags.

**Plain Vanilla JS**

```js

const createList = (listElement, data) => {
  listElement.innerHTML = "" //Empty the UL/OL of existing li tags

  //loop over list an add li
  data.forEach((listItem, index)=> {
    const li = document.createElement('li') //create li
    li.innerText = listItem //add text to li
    listElement.appendChild(li)
  })
}

const arr = ["Cheese", "Meat", "Vegetables"]

const ul = document.querySelector('ul')

const createList(ul, arr)
```

**jQuery**

```js

const createList = ($listElement, data) => {
  $listElement.empty() //Empty the UL/OL of existing li tags

  //loop over list an add li
  data.forEach((listItem, index)=> {
    const $li = $('<li>').text(listItem) //create li and add text
    listElement.append(li)
  })
}

const arr = ["Cheese", "Meat", "Vegetables"]

const $ul = $('ul')

const createList($ul, arr)
```

Now if the array changes we can just run this function again and update the list, that's convenient.

## Adding Event Listeners

So using events to trigger functions on clicks, hovers, submits and more helps make a page more dynamic. This is how it is down below.

**Plain Vanilla**

```js
const button = document.querySelector("button")
button.addEventListener("click", event => {
  console.log("You have clicked the button")
  console.log(event.currentTarget)
})
```

**jQuery**

```js
const $button = $("button")
$button.on("click", event => {
  console.log("You have clicked the button")
  console.log(event.currentTarget)
})
```
