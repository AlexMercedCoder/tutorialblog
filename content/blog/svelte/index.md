---
title: Svelte - The New Kids on the Frontend Framework Block
date: "2020-09-05T22:12:03.284Z"
description: "Compiling based frontend framework"
---

## What is Svelte

From Svelte.dev

> Svelte is a radical new approach to building user interfaces. Whereas traditional frameworks like React and Vue do the bulk of their work in the browser, Svelte shifts that work into a compile step that happens when you build your app.

> Instead of using techniques like virtual DOM diffing, Svelte writes code that surgically updates the DOM when the state of your app changes.

**My Web Svelte Video Playlist:** https://www.youtube.com/playlist?list=PLY6oTPmKnKbZpyj6WhUsjri1Tw_BO-obP

## Getting Started

To generate a new project run the command

```npx degit sveltejs/template project1```

```cd project1```

```npm install```

### The Scripts

```npm run build``` will build your final project build

```npm run dev``` to run a dev server while developing

```npm run start``` this runs server to serve the build server for deploying to heroku

### File Structure

In the source folder you'll find all the files you'll be generally working in. Let's first discuss the main.js

```js
import App from './App.svelte';

const app = new App({
	target: document.body,
	props: {
		name: 'world'
	}
});

export default app;
```

This is the file that imports the App component and mounts to the DOM, it also is the place to pass any desired props to APP such as "name" in the default template.

## A Svelte Component

If you have used vue and worked with .vue files you'll find the workflow of having JS/CSS/HTML in one file very familiar. Let's replate the existing contents of App.svelte with a blank component.

```html
<script>

</script>

<main>

</main>

<style>

</style>

```

In order to receive a prop such as name from main js you need to export the variable within the script tags.

```html
<script>
export let name;
</script>

```

Now we can interpolate the name prop into the template of the app component.

```html
<main>
<h1>Hello {name}</h1>
</main>
```

## State and Reactivity

Since all the logic is worked out in the compile step, you don't have to do anything special when it comes to state, just declare variables and if they change the DOM will update accordingly.

let's create a counter variable in App

```html
<script>
export let name;

let counter = 0;

</script>
```

lets add the counter and a button to our template

```html
<main>
<h1>Hello {name}</h1>
<h2>{counter}</h2>
<button>add</button>
</main>
```

Let's create a function to add one to counter

```html
<script>
export let name;

let counter = 0;

const addOne = () => {
	counter += 1
}

</script>

```

Then let's add the event to the button.

```html
<main>
<h1>Hello {name}</h1>
<h2>{counter}</h2>
<button on:click={addOne}>add</button>
</main>
```

Now you should be able to click the button and see the counter update!

## Making more components

- make a components folder
- In that folder make a Hello.svelte

Add the following contents

```html
<script>
</script>

<main>
<h1>Hello World</h1>>
</main>

<style>

</style>
```

let's bring the component over to App so we can use it...

```html
<script>
import Hello from './components/Hello.svelte'
export let name;

let counter = 0;

const addOne = () => {
	counter += 1
}

</script>
```

Now let's use it!

```html
<main>
<Hello/>
<h2>{counter}</h2>
<button on:click={addOne}>add</button>
</main>
```

## In summary

As you can see a lot of the development just feels like fairly standard javascript which is what makes Svelte so easy to learn. Since all of the logic is generated at compile when you run the build command the bundles are super small and the apps are super fast, there is certainly reason why Svelte has been growing quickly in popularity among developers, check it out!


