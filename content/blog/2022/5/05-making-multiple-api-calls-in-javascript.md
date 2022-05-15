---
title: Making Multiple API Calls in Javascript
date: "2022-05-15"
description: "Different Patterns of Making Multiple API Calls"
author: "Alex Merced"
category: "javascript"
bannerImage: "/images/postbanner/2022/batch-streaming.png"
tags:
  - javascript
---

(all examples will use the browser native fetch function using async/await syntax)

Making HTTP Requests (API calls) in Javascript can be done several ways such as using the browser native `fetch` function, the jQuery `$.ajax` function, the ever popular `axios` library and endless more options. There are also options tailored to work with different backend and frontend frameworks like `react-query` and `react-fetch` for React.

What method you use, the general logic doesn't change:

- you make a request which returns a promise
- data can't be used till the promise resolves

So often making a single request will be something like this.

```js
async function getData (){

    const url = //... api url

    const response = await fetch(url) // make request

    const data = await response.json() // turn json response to javascript object

    // do stuff with the data, like updating state in a frontend framework
}

getData() // invoke the function defined above
```

Simple enough, but what about making multiple API calls, there are generally two scenarios to consider.

## Two independant calls, but I need the data from both before moving on

So maybe I need data from two sources, but I don't want the subsequent code to run till both requests have completed. 

I could just use await and do them one by one.

```js

async function getData(){
    const url1 = //...
    const url2 = //...

    const response1 = await fetch(url1)
    const data1 = await response1.json()

    const response2 = await fetch(url2)
    const data2 = await response1.json()

    // do what you want with data1 and data2 here
}

```

This works great the only downside is the await keyword pauses the function so the second request won't happen till the first one finishes. We can have them both run at the same time but make sure the function doesn't continue till they both complete using Promise.all().

```js

async function getData(){
    const url1 = //...
    const url2 = //...

    const responses = await Promise.all([fetch(url1), fetch(url2)])

    const data1 = await responses[0].json()
    const data2 = await responses[1].json()

    // do what you want with data1 and data2 here
}

getData()
```

Promise.all returns a promise that doesn't resolve till all promises in the array passed in are resolved (the two fetch calls). So both fetch calls are initiated but the function is paused on the Promise.all not the individual fetches. This works well if one of the two requests take a really long time that it would speed things up to have both requests made right away.

## My second request depends on the results of the prior request

Some API's breakup the data across several urls, so often times the response to the initial call just gives you urls for where you can find the rest of the data. For example the [Pokemon API](https://pokeapi.co/api/v2/pokemon) which will give you an array of pokemon, but each pokemon only has a URL of where you can get all the data for that pokemon. You'd want it to look something like this.

```js
async function getCharmandar(){
    const pokemonListUrl = "https://pokeapi.co/api/v2/pokemon"

    // get list of pokemon
    const response = await fetch(pokemonListUrl)
    const pokeList = await response.json()

    // find charmander in the array of pokemon
    const charmanderEntry = pokeList.find((poke) => poke.name === "charmandar")

    // request the charmandar data
    const response2 = await fetch(charmanderEntry.url)
    const charmander = await response2.json()

    // use the charmandar data as desired
}

getCharmander()
```

It's pretty much that simple. Just know your API's by the reading the documentation and make the requests you need as you need to!