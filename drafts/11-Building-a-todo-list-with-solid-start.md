---
title: Building a Todo List with Solid Start
date: "2022-11-12"
description: "Seeing the Power of the latest javascript meta-framework"
author: "Alex Merced"
category: "javascript"
bannerImage: "/images/postbanner/2022/5reasonsdremio.png"
tags:
  - frontend
  - backend
  - solidjs
---

I've written about SolidJS in the past, so if you aren't familiar with it here are some of my past articles:

- [Intro to SolidJS](https://main.grokoverflow.com/posts/2021/04-solidjs)
- [SolidJS Video Playlist](https://www.youtube.com/playlist?list=PLY6oTPmKnKbYaQQs3p_KrDZGAuNHYWpLw)
- [Rust, SolidJS and Tauri](https://blog.logrocket.com/rust-solid-js-tauri-desktop-app/)
- [Comparing SolidJS & VobyJS](https://blog.logrocket.com/comparing-solid-js-voby/)

In this tutorial we will walk through building a simple todo list (no database) using solid start. To simulate a database ORM we will create an object with an array and methods for manipulating that array along the way. Let's get started.

## Setup

(It is assumed you have a code editor and NodeJS installed)

- Open your editor to an empty directory
- run `npm init solid` (select bare, yes to SSR)
- If don't have pnpm install it `npm install -g pnpm`
- run `pnpm install` to install dependencies

## The Basics

Solid-Start is essentially the meta-framework for SolidJS, similar to the relationships between Next/Nuxt, React/Next, Svelte/SvelteKit, and Angular/Analog. Like many of these frameworks Start provides:

- File based routing outside the box
- The ability to define API routes
- Server-Side, Client-Side and Static rendering of files

## Routing

The main thing to understand is routing, as this will determine what gets rendered on which URL. Solid uses file based routing out of the `src/routes` directory that would map like so.

| File | Route URL |
|------|-----------|
| /src/routes/index.js | / |
| /src/routes/about/index.js| /about |
| /src/routes/about.js | /about | 
| /src/routes/blog/[slug] | /blog/{anything} |

The file should `export default` a component and that's what will be rendered on the page with that component.

```js
export default function(){
  return <h1>This is what will appear on the page</h1>
}
```

## Creating Our Data

to simulate our data from out database we'll create the following file, `src/Todo.js`.

```js
export default {
    // starting array of todos
    data: [
        {message: "Breakfast", done: false},
        {message: "Lunch", done: false}
    ],

    // function to create a new todo
    create: function(todo){
        this.data.push(todo)
    } ,

    // function to mark a todo complete
    complete: function(index){
        this.data[index].done = !this.data[index].done
    }
}
```

## Turning our Data into an API

We can create API routes from SolidJS quite easily, usually not neccessary within the App since it has many mechanisms for fetching and handling data, but API routes are great for exposing logic to other clients via an API. We will create API routes to simulate that our data is coming from an external sources and show off Starts internal mechanisms to pull that data.

Create the following files: 
- `src/routes/api/todo/index.js` --> `/api/todo`

`src/routes/api/todo/index.js`
```js
// ~/ = /src/ , this configuration is in the jsoconfig.json
import Todo from "~/Todo.js"
import {json} from "solid-start"

// function for handling get requests to /api/todo
export async function GET(){

    return json(Todo.data)

}
```

Now should be able to see the todos as JSON from `/api/todo`

## Creating Our Todo App

Let's add the following in `/src/routes/index.js`

```js

```