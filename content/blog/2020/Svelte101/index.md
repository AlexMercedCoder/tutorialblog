---
title: Learning Svelte 101
date: "2020-10-05T22:12:03.284Z"
description: Cybernetically Enhanced Web Apps!
---

**This tutorial will be using this codesandbox, so open it up and fork it**: https://codesandbox.io/s/welcome-to-svelte-is0hb

**My Svelte Video Playlist** https://www.youtube.com/playlist?list=PLY6oTPmKnKbZpyj6WhUsjri1Tw_BO-obP

In the future you can spinup a quick Svelte Template using the command `npx merced-spinup svelte projectName`

## What is Svelte

You've probably heard of the big three Frontend UI frameworks, React, Angular and Vue. Svelte is a new entrant into the space and has really been picking up steam among developers for its small bundle sizes and low learning curve.

## Let's Begin

When you first open the codesandbox you'll be in index.js which is the entry point for Svelte into the DOM similar to ReactDOM.render in react or Vue.mount in Vue. We won't be touching anything in this file.

Head over to App.svelte, this will look very similar to working with .vue files where there is a script tag for javascript, html for your template, and script tag for any component specific CSS.

## Declaring Variables

One of the best parts of Svelte is you don't have to do anything fancy to declare your variables, just use standard javascript. No useEffect or hooks or Data objects, just declare a variable and it is useable and if that variable is ever reassigned the template will update, easy. The reason this works is cause Svelte doesn't have to build a framework that works during runtime, instead it compiles all your code into standard javascript which allows it to have the simpler syntax and small bundles.

Declare a variable

```html
<script>
  const hello = "Welcome to Svelte"
  const myVar = "I just declared this!"
</script>
```

Then let's use that variable in your template!

```html
<main>
  <h1>{hello}</h1>
  <h2>{myVar}</h2>
</main>
```

Nice, like react interpolation only takes one curly bracket instead of the double curlies of Vue and Angular. Not only you can interpolate variables but any valid javascript express (try 2+2).

## Props

Let's create a new component with a file called Other.svelte. We can now import this in App, and we don't even need to export the component from the other Svelte file, the compiler knows.

So update App.svelte to...

```html
<script>
  import Other from "./Other.svelte"
  const hello = "Welcome to Svelte"
  const myVar = "I just declared this!"
</script>

<style>
  main {
    font-family: sans-serif;
    text-align: center;
  }
</style>

<main>
  <h1>{hello}</h1>
  <h2>{myVar}</h2>
  <Other />
</main>
```

Update Other.svelte to...

```html
<div>
  <h1>Hello World</h1>
</div>
```

To have the Other component accept a prop we just have to export the variable that will be the prop.

```html
<script>
  export let myProp
</script>

<div>
  <h1>{myProp}</h1>
</div>
```

Now let's send the prop down from App.svelte

```html
<script>
  import Other from "./Other.svelte"
  const hello = "Welcome to Svelte"
  const myVar = "I just declared this!"
</script>

<style>
  main {
    font-family: sans-serif;
    text-align: center;
  }
</style>

<main>
  <h1>{hello}</h1>
  <h2>{myVar}</h2>
  <Other myProp="cheese" />
</main>
```

## Events and Reactive Data

Let's create a reassignable variable using let, call it count and initialize it at 1

Create a handle click function that adds one to count _(The reassignment is what triggers the re-render, so be careful with objects and arrays where changing element/property values isn't a reassignment.)_

Let's add count to our template

Let's add a button that runs the handleClick function when clicked.

It should look like below.

```html
<script>
  export let myProp
  let count = 1

  const handleClick = () => {
    count += 1
  }
</script>

<div>
  <h1>{myProp}</h1>
  <h2>{count}</h2>
  <button on:click="{handleClick}">Add One</button>
</div>
```

The on:(event) syntax should look similar to Vue but passing the function in curly brackets should be familiar to React. But yeah, this was pretty easy, huh!

## Iterating over an array

The way you handle iterating in Svelte is actually more similar to templating languages like Jinja or Handlebars vs React with map or Vue/Angular with the for directive.

Let's create an area and create a for block to loop the values like so...

**Other.svelte**

```html
<script>
  export let myProp
  let count = 1

  const nums = [1, 2, 3, 4, 5, 6]

  const handleClick = () => {
    count += 1
  }
</script>

<div>
  <h1>{myProp}</h1>
  <h2>{count}</h2>
  <button on:click="{handleClick}">Add One</button>
  {#each nums as num}
  <h1>{num}</h1>
  {/each}
</div>
```

See, that wasn't so bad, was it?

## Bottom Line

Svelte is pretty easy to learn and it's easy to see why it's growing in popularity so quickly. Svelte also has it's own Next/Nuxt like SSR/SSG framework called Sapper and a mobile app library called Svelte Native, Svelte is doing what it can to provide all the tools to complete with the big boys of Vue, Angular and React.
