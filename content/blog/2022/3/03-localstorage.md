---
title: Web Storage API Part 1 - LocalStorage and SessionStorage
date: "2021-03-23"
description: "Where to store data in the users browser"
author: "Alex Merced"
category: "oltp"
bannerImage: "/images/postbanner/2022/batch-streaming.png"
tags:
  - web storage
  - oltp
---

## Web Storage APIs

Over the next few articles I'll be writing about Web Storage API that allow you to store application data not in a database you control but inside the users browser.  The main three options are.

- [LocalStorage/SessionStorage](https://developer.mozilla.org/en-US/docs/Web/API/Web_Storage_API)
- [IndexedDB](https://developer.mozilla.org/en-US/docs/Web/API/IndexedDB_API)
- [Web SQL](https://www.geeksforgeeks.org/what-is-web-sql/)

## LocalStorage & SessionStorage

This is a synchronous key/value store. With the Web Storage API you can store a string under any key you want. You can either store it perpetually in LocalStorage or until the user closes the browser with SessionStorage.

One typical pattern is to store JSON strings to store a lot of data under one key. In the below example we store some basic site settings in localStorage.

```js
// object that represents site settings
const settings = {
  mode: "dark",
  primaryColor: "black",
  secondaryColor: "white"
}

// turn the object into a JSON string
const settingsAsJSON = JSON.stringify(settings)

// save the string into localStorage
window.localStorage.setItem("settings", settingsAsJSON)
```
If I wanted to load these settings if they exist when the page loads I could do something like this.

```js
// default settings
let settings = {
  mode: "light",
  primaryColor: "white",
  secondaryColor: "black"
}

// retrieve the string from localStorage
const loadedJSONSettings = window.localStorage.getItem("settings)

// check if there actually was any data, if so, parse the json
if (loadedJSONSettings){
  // since there is data, parse the JSON
  settings = JSON.parse(loadedJSONSettings)
  // below any code to update the dom based on these settings
  // ...
}

```

If later on we want to clear the data it is as simple as:

```js
window.localStorage.removeItem("settings")
```

If we only want to store the data until the user closes the browser we would just replace `localStorage` with `sessionStorage`. Some things to keep in mind.

- You can see what is stored for a particulate page by going to the `application` section of dev tools in the browser.

- Web Storage is synchronous so using it for large data and operations can block the main thread (make your code slow).

## Next Time

Next time we'll explore IndexedDB which provides an asynchronous document storage in the browser.