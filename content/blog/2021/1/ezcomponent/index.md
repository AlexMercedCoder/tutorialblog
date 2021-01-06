---
title: EZComponent -Open Source Frontend Framework using Web Components
date: "2021-01-06T12:12:03.284Z"
description: Component Based Frontend Framework
---

## The Origin Story

Over the last year, I've been working on creating different frontend frameworks based on web components. All of them are open source and welcome contributions and pull requests, find all my libraries [here](https://meet.alexmercedcoder.com/libraries). EZComponent is my latest effort in this regard and I think I've hit a sweet spot in the workflow, learning curve, and features.

## Generating a New Project

Let's take it for a spin by running the following command:

- `npx create-ezcomponent-app project1`

- cd into the new folder and run `npm install`

- `npm run dev` to run the dev server

## File Layout

In src/index.js we find this

index.js
```js
import ezcomponent from "ezcomponent"
import "./components/Header";
import "./components/Main";
import "./components/Footer";

ezcomponent({
  name: "my-app",
  render: (info, props, component) => `
  <my-header></my-header>
  <my-main></my-main>
  <my-footer></my-footer>
  `
})

//Inject into body
const body = document.querySelector("body");
body.innerHTML = `<my-app></my-app>`;
```

- We import our components
- We define our app component
- render the component into the body

Defining components is just a matter of running the ezcomponent function and passing it an object with all the configurations for your component. The minimum the config object should include are:

- name which is a kebab case string "kebab-case"
- render which is a function that takes info (state), props, and the component instance and returns a template string (every function takes the same three parameters in the config object)

## Styling

Another property that can be passed is styles which is a function that returns a string of CSS so modify the App component like so.

```js
ezcomponent({
  name: "my-app",
  styles: (info, props, component) => `
  h1 {
    color: red;
  }
  `,
  render: (info, props, component) => `
  <my-header></my-header>
  <my-main></my-main>
  <my-footer></my-footer>
  `
})
```

Notice, we see no change... that's because every component has its own shadowDOM so any styles only apply to that component. Under the hood, this is just an abstraction over the Web Component API so features like parts and slots are available to you. Recommend looking for my previous posts on the web component API to learn more about the underlying web component system. My goal here was only to make working with Web Components simpler with build reactivity and some extra levels of lifecycle.

So let's head over to the Footer component and try styling that one.

Footer.js
```js
import ezcomponent from "ezcomponent";

ezcomponent({
  name: "my-footer",
  styles: (info, props, components) => `
  h1 {
    color: red;
  }
  `,
  render: (info, props, component) => `<h1>I am the footer component</h1>`,
});
```

Now the footer components text is red. Notice how we don't have to export the component. Just by importing the file the ezcomponent function in the file is invoked registering the component with the browser making it available to use throughout your application.

## Lifecycle

There are several functions, all being passed (info, props, component) you can pass into the config object...

- initial: runs when the component first mount before the first render
- preRender: runs before every render
- postRender: runs after every render
- postInitial: runs after the initial render
- disconnect: runs when the component is removed.

tip: post-render is the ideal place to add event listeners using plain vanillaJS, keep in mind the shadowDOM so querying elements should be component.shadowRoot.querySelector().

## Info

Info is the equivalent to a state in React or Data in Vue, to use it just add an info property to the config object called info that is an object with any data you want to pass in. To update info just use the component.update function and pass an object with any update or new properties to info. (It merges it with the previous info object so you don't have to list every property every time or use the spread operator). Updates will trigger another render cycle of preRender, render, and postRender.

## Adding Methods

Since the component is passed into all the functions you can add new properties and methods to the component in the different functions in the config object. I'd probably define any methods in the initial function so they are available on the onset and to the rest of the functions.

## Conclusion

That is EZComponent, I hope you'll consider giving it a shot or even making contributions and making a pull request to this or any of my other libraries!