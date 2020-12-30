---
title: Fundamentals of Client Side Javascript
date: "2020-12-28T12:12:03.284Z"
description: The Building Blocks of Client-Side Javascript Master
---

## Why read this?

Often when learning client-side javascript people skip right to DOM manipulation with the native DOM API (document.querySelector) or with jQuery. While these are important and pivotal skills to have there are several javascript browser APIs that can be used to solve all sorts of problems.

The ones I'll be covering

- navigator
- window
- customElements
- document
- localStorage

- [FULL LIST OF WEB APIS](https://developer.mozilla.org/en-US/docs/Web/API)

## navigator API

- [navigator documentation](https://developer.mozilla.org/en-US/docs/Web/API/Navigator)

The navigator object has several functions that can be used to determine

- what browser is being used (navigator.userAgent)
- whether there is an internet connection (navigator.online)
- register service workers

## window API

The window object really bundles most of the APIs I'll be talking about but one of the parts of it people may not be aware of but is quite useful is the location property.

- [window API] (https://developer.mozilla.org/en-US/docs/Web/API/Window)

- window.location gives you access to the URL bar to redirect users to other pages or parse URL queries from the URL

## customElements

the customElements registry allows you to register elements with HTML tags, also known as web components.

- [custom elements API](https://developer.mozilla.org/en-US/docs/Web/API/Window/customElements)
- [All About Web Components](https://tuts.alexmercedcoder.com/2020/WebComponentLibs/)

## document

The document object allows us to manipulate, create, and remove elements from the DOM (document object model). This is how we make sites dynamic, exciting, and interactive. jQuery is a popular abstraction over this API, the most downloaded javascript library of all time. Modern Frontend frameworks like React, Vue, Angular, and Svelte also provide a large amount of abstraction over this API.

- [DOM Manipulation Reference - Plain Vanilla/jQuery](https://tuts.alexmercedcoder.com/2020/jQuery/)
- [document API](https://developer.mozilla.org/en-US/docs/Web/API/Document)

## localStorage and sessionStorage

The storage API allows you to store data as strings in the browser.

- localStorage: saves the data until you remove it
- sessionStorage: saved the data until the browser is closed

They both work the same way.

- [Storage API](https://developer.mozilla.org/en-US/docs/Web/API/Storage_API)

## Adding Data

```js

const data = {
    name: "Alex",
    age: 35
}

localStorage.setItem("data", JSON.stringify(data))
sessionStorage.setItem("data", JSON.stringify(data))
```

## retrieving data

```js

const extractedData = JSON.parse(localStorage.getItem("data"))

const extractedData2 = JSON.parse(sessionStorage.getItem("data"))

```

## Removing Data

```js

localStorage.removeItem("data")
sessionStorage.removeItem("data")

```