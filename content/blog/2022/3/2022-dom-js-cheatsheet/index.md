---
title: Javascript DOM & jQuery Cheatsheet 2022
date: "2022-03-12T12:12:03.284Z"
description: All the main bits summed up in one place
---
#### Join the slack and discord community at devNursery.com

[DOM/jQuery Video Playlist](https://youtube.com/playlist?list=PLY6oTPmKnKbaK2r_zkLKf_6iHBW09_Ucc)

## Window Object
Represents the entire browser window

| action |syntax |notes |
|--------|-------------------|-----|
| what browser is user using | `window.navigator` | [Read More](https://developer.mozilla.org/en-US/docs/Web/API/Window/navigator)|
| store data in localStorage | `window.localStorage.setItem("name", JSON.stringify(myObject))` | [Read More](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)|
| get data from localStorage | `const data = JSON.parse(window.localStorage.getItem("name"))` | [Read More](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)|
| remove data from localStorage | `window.localStorage.removeItem("name")` | [Read More](https://developer.mozilla.org/en-US/docs/Web/API/Window/localStorage)|
| send user to another webpage | `window.location = "https://www.google.com"` | [Read More](https://developer.mozilla.org/en-US/docs/Web/API/Window/location)


## selecting and creating DOM Nodes

The document object represents the document defined by the `<doctype!>` tag, essentially this of document as an object representing everything within the `<html>` tags in your html file.

| action | plain vanilla dom |  jquery | Notes |
|--------|-------------------|---------|-------|
| select an element based on CSS selector | `document.querySelector("#id")` | `$("#id")` ||
| select multiple elements based on CSS selector | `document.querySelectorAll(".class")` | `$(".class")`||
| run code after dom loads | `window.addEventListener("load", () => {...code here})` | `$(() => {...code here})` | You could also either move script tag to bottom of body or use defer keyword in script tag |
| Create a new element | `document.createElement("h1")` | `$("<h1>")` | with jQuery you could also add attributes in the string like `$("<h1 id='cheese'>")`|

## Manipulating DOM nodes

Below are ways to work with selected elements. `el` will represent an elements selected with plain javascript like `const el = document.querySelector("h1")` and `$el` will represent an element selected with jQuery such as `const $el = $("h1")`.


| action | plain vanilla dom |  jquery | Notes |
|--------|-------------------|---------|-------|
| edit text | `el.innerText = "new value"` | `$el.text("new value")` ||
| edit html | `el.innerHTML = "<h1>new value</h1>"` | `$el.html("<h1>new value</h1>")` ||
| add a css class | `el.classList.add("className")` | `$el.addClass("className")` ||
| remove a css class | `el.classList.remove("className")` | `$el.removeClass("className")` ||
| toggle a css class | `el.classList.toggle("className")` | `$el.toggleClass("className")` ||
| get the value of an attribute | `el.getAttribute("id")` | `$el.attr("id")` ||
| set the value of an attribute | `el.setAttribute("id", "new value")` | `$el.attr("id", "new value")` ||
| remove an attribute | `el.removeAttribute("id")` | `$el.removeAttr("id")` ||
| get the value of a css property | `el.style.backgroundColor` | `$el.css("background-color")` | every css property in the style object has camel case names|
| change a css property | `el.style.backgroundColor = "black"` | `$el.css("background-color", "black")` | every css property in the style object has camel case names|
|empty the contents of the element| `el.innerHTML = ""` | `$el.empty()` ||
|remove the element from DOM| `el.remove()` | `$el.remove()` ||
|append element as last child of another node| `target.append(el)` | `$target.append(el)`||
|prepend element as last child of another node| `target.prepend(el)` | `$target.prepend(el)`||
|insert element before another element| `target.before(el)` | `$target.before($el)`||
|insert element after another element| `target.after(el)` | `$target.after($el)`||
|listen for events on an element| `el.addEventListener("event", (event) => {...what happens here})` | `$el.on("event", (event) => {...what happens here})` | |

## Looping Over Data to Create Elements

Plain Vanilla

```js
// array of data
const cheeses = ["gouda", "munster", "brie"]

// select existing ul element, add an li for each cheese
const ul = document.querySelector("ul")
for (cheese of cheeses){
    //create li
    const li = document.createElement("li")
    // add text to the li
    li.innerText = cheese
    // append to ul
    ul.append(li)
}
```

jQuery

```js
// array of data
const cheeses = ["gouda", "munster", "brie"]

// select existing ul element, add an li for each cheese
const $ul = $("ul")
for (cheese of cheeses){
    //create li
    const $li = $("<li>")
    // add text to the li
    $li.text(cheese)
    // append to ul
    $ul.append($li)
}
```

## Looping Over Elements to Modify Theme

Plain Vanilla

```js
// Select all h1's on the page to make them pink
const h1s = document.querySelectorAll("h1")

// loop over h1s
for (h1 of h1s){
    h1.style.color = "pink"
}
```

jQuery

```js
// Select all h1's on the page to make them pink
const $h1s = $("h1")

// loop over h1s
for (h1 of $h1s){
    // turn the h1 node into a jQuery object
    const $h1 = $(h1)
    // make it pink
    const $h1.css("color", "pink")
}
```