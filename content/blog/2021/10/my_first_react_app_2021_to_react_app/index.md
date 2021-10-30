---
title: My First React App - 2021 Intro to React
date: "2021-10-29T12:12:03.284Z"
description: The Basics of React
---

## Before Starting this tutorial

- [You need a foundational understand of html/css/js](https://www.youtube.com/playlist?list=PLY6oTPmKnKbbeAFC_F_f6jBKU4Xfu24sX)
- [Must have a recent version of NodeJS Installed (I'm running 16.11.1)](https://nodejs.org/en/)

## What is React

React is a frontend framework that helps keeping your UI(User Interface) in sync with related data. Without a framework like React it would be on the developer to imperitively code (coding each step) how the UI is updated when the data changes. With a framework like React instead we can declaratively (describing the result) layout our UI and where the data belongs and React will manage the updates when data changes.

React isn't the only framework in this category, below are intro videos I've made for many of these frameworks:

- [Intro to React Video](https://www.youtube.com/playlist?list=PLY6oTPmKnKbaEz7kzcxnBdDmfmVz4GRg2)
- [Intro to SolidJS Video](https://www.youtube.com/playlist?list=PLY6oTPmKnKbaEz7kzcxnBdDmfmVz4GRg2)
- [Intro to Svelte Video](https://www.youtube.com/playlist?list=PLY6oTPmKnKbaEz7kzcxnBdDmfmVz4GRg2)
- [Intro to Angular Video](https://www.youtube.com/playlist?list=PLY6oTPmKnKbaEz7kzcxnBdDmfmVz4GRg2)
- [Intro to Vue Video](https://www.youtube.com/playlist?list=PLY6oTPmKnKbaEz7kzcxnBdDmfmVz4GRg2)

If you wanted to see how these frameworks work in relation to the backend below you'll see a link to an API built in express and the frontend being belt in several frameworks:

- [Express API Build ](https://youtu.be/tAjfO5hIzY8)
- [React Frontend Build](https://youtu.be/FdDSW11iU4k)
- [Plain Vanilla Frontend Build](https://youtu.be/15rtEHiHRB8)
- [Angular Frontend Build](https://youtu.be/NBhCNf6ol3k)
- [Vue Frontend Build](https://youtu.be/1zLtUc7F8Ck)
- [Svelte](https://youtu.be/sULPuGFkYLc)
- [SolidJS](https://youtu.be/PW6Re59Hb-8)
- [StencilJS Part 1](https://youtu.be/DW3dB59-r3U)
- [StencilJS Part 2](https://youtu.be/_xdq8P1r3_U)
- [RiotJS](https://youtu.be/tEOqiGQ3AdE)
- [Native Web Components](https://youtu.be/IqtbSQm4m9U)
- [AMPonent](https://youtu.be/ofQJnpZzRBQ)
- [Lit-Element](https://youtu.be/aYJNKNUMjZE)

## Getting Started

The first step in getting started with React is spinning up one of many react templates that exist.

- The Main Official React Starter `npx create-react-app PROJECT_NAME` (all the bells and whistles using webpack)
- The Vite Starter (Super Fast Alternative to Webpack) - `npm init vite`
- create-react-basic (stripped down template, great for learning without the huge size of CRA) `npx create-react-basic PROJECT_NAME`

Keep in mind the file names and organization may differ slightly from generator to generator but the principles are always the same.

So let's start with the main option, run the command `npx create-react-app my-first-react-app`

this creates a folder with our project, keep in mind this folder will have a git repository out of the gate.

## Getting Familiar with what's inside

Most of the framework in the category will have a very similar setup.

- node_modules... where all the libraries go for any node project
- the public folder, this is the home of the index.html, favicons and any images you may want to reference
- the src folder, the bundler will bundle all the things in the folder starting with the index.js, all your work is done here

## Looking at index.html

Take a quick look, notice this html file is really bare bones only including a div with the id of root, that's right we're shipping an empty html file to the user.

```js
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <link rel="icon" href="%PUBLIC_URL%/favicon.ico" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <meta name="theme-color" content="#000000" />
    <meta
      name="description"
      content="Web site created using create-react-app"
    />
    <link rel="apple-touch-icon" href="%PUBLIC_URL%/logo192.png" />
    <!--
      manifest.json provides metadata used when your web app is installed on a
      user's mobile device or desktop. See https://developers.google.com/web/fundamentals/web-app-manifest/
    -->
    <link rel="manifest" href="%PUBLIC_URL%/manifest.json" />
    <!--
      Notice the use of %PUBLIC_URL% in the tags above.
      It will be replaced with the URL of the `public` folder during the build.
      Only files inside the `public` folder can be referenced from the HTML.

      Unlike "/favicon.ico" or "favicon.ico", "%PUBLIC_URL%/favicon.ico" will
      work correctly both with client-side routing and a non-root public URL.
      Learn how to configure a non-root public URL by running `npm run build`.
    -->
    <title>React App</title>
  </head>
  <body>
    <noscript>You need to enable JavaScript to run this app.</noscript>
    <div id="root"></div>
    <!--
      This HTML file is a template.
      If you open it directly in the browser, you will see an empty page.

      You can add webfonts, meta tags, or analytics to this file.
      The build step will place the bundled scripts into the <body> tag.

      To begin the development, run `npm start` or `yarn start`.
      To create a production bundle, use `npm run build` or `yarn build`.
    -->
  </body>
</html>
```

## src/index.js

Things start to make more sense once we look inside src/index.js.

```js
import React from "react"
import ReactDOM from "react-dom"
import "./index.css"
import App from "./App"
import reportWebVitals from "./reportWebVitals"

ReactDOM.render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
  document.getElementById("root")
)
```

- notice you can import css files, any css file imported this way will become part of the global stylesheet of the app. Although breaking your css files into multiple files can help keep things organized, but you could just put everything in the index.css if you want as well.
  (if you want to use sass just install `npm install sass` and create/import sass/scss files)

- React is the framework, ReactDOM is the library that will take our react code and inject into that empty html file

- the ReactDOM.render function takes the code from the first argument (looks like html...) and injects it into the html file in the place specified in the second argument, which happens to be that div with the id of root.

Although... what is this weird HTML looking syntax, I never heard of an App html tag...

This is not HTML, it is something called JSX. It's a syntax that looks a lot like HTML, but during build time a special Babel plugin from facebook converts JSX into calls of a function called React.createElement(), luckily JSX makes it that we don't need to care about this function but just how to write JSX.

- Notice that what ReactDOM is injecting is the App tag, that's called a component. All a component is at the end of the day is a function that returns JSX or null. Long as that statement is true that function can be written in JSX syntax, for example.

If I define a function like so...

```js
const HelloWorld = () => <h1>Hello World</h1>
```

Since that is a function that returns valid JSX I can use in other JSX like so

```html
<div>
  <HelloWorld />
</div>
```

### There are some rules when it comes to JSX:

1. There can only be ONE top level tag
2. when designating a class, you must use "className" not "class" `<div className="container">`
3. Variables containing numbers/booleans/strings/jsx/arrays of jsx/js expressions can be inserted using curly brackets in jsx like so `<h1>{someVariable}</h1>` (arrays and objects can't be injected this way)
4. all normal css or html attributes in JSX are now camelCase `<div style={{backgroundColor: "yellow"}} onClick={someFunction}>`
5. What would normally be the onInput event on inputs is now the onChange event

## See the default react page

Before we start editing files we should see the default in action, run the command `npm start` to get the server going and you should see the spinning React logo. All these visuals are coming from what we see in the App.js file.

## The app.js file

Typically each component gets its own file (not required, but good code organization). So this file contains the App component we saw being mounted by ReactDOM earlier. This component is called the App component because it is truly where your app starts. Let's start out by cleaning out the app component

App.js

```js
import logo from "./logo.svg"
import "./App.css"

function App() {
  return <div className="App"></div>
}

export default App
```

Now the screen should be blank. Let's first try declaring a variable in the function and injecting it into the JSX the component returns.

```js
import logo from "./logo.svg"
import "./App.css"

function App() {
  const word = "Hello World"

  return (
    <div className="App">
      <h1>{word}</h1>
    </div>
  )
}

export default App
```

So now you should see hello world on the screen, how cool is that! Now let's try defining another function that meets the definition of component (function that returns jsx) and then try using it in the App components jsx.

```js
const HelloWorld = () => <h1>Hello World</h1>

function App() {
  const word = "Hello World"

  return (
    <div className="App">
      <HelloWorld />
    </div>
  )
}
```

In this example we defined the component in the global scope, since each component usually gets its own file that is going to often be the case. Although, you can define components within a function (although it would only be usuable in that functions scope), but somtimes that may be what you want to do.

```js
import logo from "./logo.svg"
import "./App.css"

function App() {
  const HelloWorld = () => <h1>Hello World</h1>

  return (
    <div className="App">
      <HelloWorld />
    </div>
  )
}

export default App
```

One component can pass another component data using the same syntax for HTML attributes, this is referred to as props (short for properties). All props get bundled into an object that is passed into the component function, so we can receive props by declaring a parameter. We can then use that like any other data.

```js
import logo from "./logo.svg"
import "./App.css"

function App() {
  const HelloWorld = props => <h1>{props.word}</h1>

  return (
    <div className="App">
      <HelloWorld word="Hello World" />
    </div>
  )
}

export default App
```

## State

The next big concept in React is State. State is just a term for special variables, these variables when they are changed will cause the component to rebuild/rerender itself and update what the user sees on the screen.

Let's show you an example NOT using state.

```js

import logo from "./logo.svg";
import "./App.css";

function App() {

  let count = 0

  let addOne = () => {
    console.log(count)
    count += 1
  }

  return (
    <div className="App">
      <h1>{count}</h1>
      <button onClick={addOne}>Add One To Count</button>
    </div>
  );
}

export default App;
```

If you look in the console you'll notice the count variable is incrementing but the number on the screen does not change, that is because this variable is not state so when it changes it does not cause the component to render again. Now let's try it with state, but keep in mind:

- We have to import the useState function from react
- the function returns an array with the variable (count) and a function to update the variable (setCount)
- instead of directly changing the variable we use the setter function

```js
import "./App.css";
import {useState} from "react"

function App() {

  // declare the new variable using useState which is passed the initial value
  let [count, setCount] = useState(0)

  let addOne = () => {
    console.log(count)
    setCount(count+1)
  }

  return (
    <div className="App">
      <h1>{count}</h1>
      <button onClick={addOne}>Add One To Count</button>
    </div>
  );
}

export default App;
```

Now the variable should change on every click of the button. The take away is if you want the UI to update when a particular set of data changes, that data should be in a "State" variable.

## Seperation of concerns

We now have the seen the three core features of being a react beginning: creating components, passing props and using state. Although one more useful piece of knowledge is not every component needs to both track state and also render UI. Often times, it may be a good practice to have components that hold state and others that just serve the role of displaying state. 

In the example below we keep our counter state in the App component and pass the the count and addOne function to the counter component as props when then handles the displaying and updating while App is just where the state is housed.

```js
import "./App.css";
import {useState} from "react"


const Counter = (props) => {
  return (
    <div className="App">
      <h1>{props.count}</h1>
      <button onClick={props.addOne}>Add One To Count</button>
    </div>
  );
}

function App() {

  // declare the new variable using useState which is passed the initial value
  let [count, setCount] = useState(0)

  let addOne = () => {
    console.log(count)
    setCount(count+1)
  }

  return <Counter count={count} addOne={addOne} />
}

export default App;
```

I highly recommend downloading the React Developer Tools chrome extension which will allow you to examime the different components living on your page and the props and state that exist within them to better see how all this relates.

Want to Learn More about React, here are some videos you may enjoy!

*Beginning/Intermediate*
- [React Props Masterclass](https://www.youtube.com/watch?v=fVjb18ms7vI)
- [React useState Masterclass](https://www.youtube.com/watch?v=jGvAPfCRqUU)
- [Understanding React State Changes](https://www.youtube.com/watch?v=7oBIhrqwrng)
- [React DevTools Masterclass](https://www.youtube.com/watch?v=2Kn1fry91tk)
- [React Router Masterclass](https://www.youtube.com/watch?v=UOh4WzovSpQ)
- [Common React Errors](https://www.youtube.com/watch?v=ftT0S7Fu5lE)
- [Making Api Requests in React](https://www.youtube.com/watch?v=eTGqwRyg3tU)
- [Handling Forms in React](https://www.youtube.com/watch?v=x9jthCLO-34)
- [useReducer and useContext](https://www.youtube.com/watch?v=fr8c0CyrLpo)
- [Mapping JSX and Children](https://www.youtube.com/watch?v=HYjDmu9sPfc)

*Advanced*
- [Advanced State Management I](https://www.youtube.com/watch?v=7TcihYyxX4o)
- [Advanced State Management II](https://www.youtube.com/watch?v=m43xyVReK1w)
- [State Management with TaskRunner](https://www.youtube.com/watch?v=B0NHSDmPKlo)
- [React Props.children Masterclass](https://www.youtube.com/watch?v=RTK5gMTr9b0)
- [Styled Components](https://www.youtube.com/watch?v=Loz7RYU-JKM)
- [Creating Conditional Components](https://www.youtube.com/watch?v=kSh9N-X_RV4)
- [Cool React Tips](https://www.youtube.com/watch?v=a-NfvxTwKl4)
- [Redux vs useReducer](https://www.youtube.com/watch?v=dEGVZy6PoAA)