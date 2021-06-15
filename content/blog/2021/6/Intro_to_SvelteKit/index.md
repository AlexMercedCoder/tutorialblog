---
title: Intro to SvelteKit
date: "2021-06-14T12:12:03.284Z"
description: The new Svelte Based Application Builder
---

Kind of like React is a Frontend Framework and Next wraps it in a more robust set of features, the people at Svelte has Sapper (Svelte APP Maker) play the same role of providing Server Side and Static rendering along with file based routing.

Late last year the Svelte team decided to no longer maintain Sapper as the code base became hard to maintain and new innovations in bundling (See Vite/Snowback and their use of ES Modules) would be hard to implement. They decided to rebuild from scratch and rename it SvelteKit.

SvelteKit is not just meant to be the NextJS to Svelte's React, but now the main entry point into building app with Svelte. In this tutorial I'd like to generate a project with you and demonstrate some of the features of SvelteKit.

## Setup

* A Recent Version of NodeJS is required

- Use the preview version of the Svelte App Generator `npm init svelte@next some-app-name`

- answer the props (I am using JS not TS)

- cd into the folder

- run `npm install`

- run the dev server `npm run dev`

## File Based Routing

Just like Next/Nuxt, you have file based routing. Create a file called cheese.svelte in the routes folder.

cheese.svelte
```html
<h1>Cheese</h1>
```

Now open your browser and go to localhost:3000/cheese and you'll see our h1 available to see. How easy was that!

####

We can also use url params, create a folder called params and in that folder called `[param].svelte`

`/params/[param].svelte`
```html
<script context="module">
    // This script tag is run before loading up page

    // The Load Function if for any pre-rendering collection of data
    export async function load({page}){
        // using the page object from the Input object we can get the param

        // In the return value of this function we can specify props
        return {
            props: {
                param: page.params.param
            }
        }
    }
</script>

<script>
    // This is run in the normal course of a svelte component
    export let param; // variable to receive param prob
</script>

<h1>{param}</h1>
```

## API Enpoints

In next you export functions in an API folder and the are treated as Express like routes. In SvelteKit you export files with a `json.js` suffix that export a function named after an http method that can return a response. Let's create `meal.json.js`

routes/meal.json.js
```js
export async function get(){

    //The Response Object
    const response = {
        status: 200,
        headers: {
            "Content-Type": "application/json"
        },
        body: {
            appetizer: "Beef Skewers",
            mainCourse: "Singapore Mei Fun",
            dessert: "Tres Leches"
        }
    }

    return response
    
}
```

Now headover to localhost:3000/meal and see the output. (If for some reason meal.json.js gives you a 404 give it a shot at meal.js).

## Layouts

If you create a file called `__layout.svelte` it will be applied as a layout in the pages in that directory and below (it'll ignore directories with another layout or a `__layout.reset.svelte` file). It will inject the page wherever a slot if located in the template, let's try it.

Create `routes/__layout.svelte`
```html
<h1>Header</h1>
<slot></slot>
<h1>Footer</h1>
```

Now go back to localhost:3000/cheese and you'll see our cheese wrapped by the h1s from out layout!

## Other Features

- files or folders pre-fixed with an underscore will be ignored by the router. So you can put individual components in a `/_components/` folder and import them into the pages that need them.

- You can toggle on and off features page by page like prerendering, hydration and static generation by merely exporting a boolean

- Hooks to help customize how the SvelteKit Server response and creating shared data via a session or store

- Adapters created to help optimize the final build for different deployment targets or to generate all server side or all static apps.