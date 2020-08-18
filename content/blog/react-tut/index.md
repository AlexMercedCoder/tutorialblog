---
title: Hello World in Vue
date: "2020-08-18T22:12:03.284Z"
description: "React 101 Tutorial"
---

## What is React?

React is the biggest front-end UI framework currently in front-end development. This tutorial aims to give a you a basic introduction using script tags to help focus on how react works without having to get lost in discussion of build setups with webpack and node.

## Setup

- in a folder somewhere on your computer create three files.
  - index.html
  - app.js
  - style.css

#### index.html

You need the following libraries in your script tags.

**REACT:** Is the library that has all the core React features and syntax.
**ReactDOM:** This is the library that injects React into your html file.
**Babel:** This takes all the cutting edge ES6 and JSX code in your JS files and turns it into browser complient javascript.

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Document</title>

    <!-- THE REACT CDN LINKS -->
    <script
      crossorigin
      src="https://unpkg.com/react@16/umd/react.development.js"
    ></script>
    <script
      crossorigin
      src="https://unpkg.com/react-dom@16/umd/react-dom.development.js"
    ></script>
    <!-- -------------------------- -->

    <!-- THE BABEL CDN LINK -->
    <script
      src="https://cdnjs.cloudflare.com/ajax/libs/babel-standalone/6.26.0/babel.min.js"
      integrity="sha512-kp7YHLxuJDJcOzStgd6vtpxr4ZU9kjn77e6dBsivSz+pUuAuMlE2UTdKB7jjsWT84qbS8kdCWHPETnP/ctrFsA=="
      crossorigin="anonymous"
    ></script>
    <!-- ------------------------------------ -->

    <!-- YOU CUSTOM CODE TAGS -->
    <script type="text/babel" src="app.js" defer></script>
    <link rel="stylesheet" href="style.css" />
    <!-- ----------------------------------------------- -->
  </head>
  <body>
    <div id="app"></div>
  </body>
</html>
```

This is all you need, the rest of your react app will be done completly from your React code within your Javascript files.

#### app.js

Every React app typically starts with the App component (convention, not mandatory). This App component is the entry point for your entire application and is injected into the DOM using the ReactDOM.render function which injects a component in place of a target html element.

```js
// THE APP COMPONENT
const App = props => {
  return <h1>Hello World</h1>
}

// REACTDOM RENDER FUNCTION INSERT THE APP AND ITS CHILDREN TO THE DOM
ReactDOM.render(<App />, document.getElementById("app"))
```

Notice the APP component is a function, this tutorial will be focusing on functional components in lieu of class components. In this one JS file format, it's best keep the App component and the ReactDOM call at the bottom of the file.

## React Features Features

## JSX

Noticed the App component is currently returning html as if it were primitive datatype, this called JSX. This is one of the most popular parts of React which allows you to write your component templates in familiar HTML syntax with a few minor quirks such as...

- There can only be one top level element, you can't have multiple elements at the top level.

- If you want to refer to css classes you must replate the word class with className (because class is a reserved word in JS)

- events are expressed in camel case for `<h1 class="style" onchange="function">` becomes `<h1 className="style" onChange={function}>`

- when returning more complex JSX that has more than one elements (still only one top level one), wrap the jsx in () like so `(<div><h1>Hello World</h1></div>)`

- JSX can be treated like a data type and can be assigned to variables so this is possible

```js
const pieceOfUI = true ? <h1>It's true</h1> : <h1> It's false </h1>
```

## Interpolation

Any template can have data from the particular component interpolated into it, so make the following changes to our App component to demonstrate this.

```javascript
// THE APP COMPONENT
const App = props => {
  const hello = "Hello World"

  return <h1>{hello}</h1>
}

// REACTDOM RENDER FUNCTION INSERT THE APP AND ITS CHILDREN TO THE DOM
ReactDOM.render(<App />, document.getElementById("app"))
```

Within the function we declared the variable, "hello" and we then interpolated it into our template using {}. You can only use data inside the function. To receive data from other components it must be passed in as "props" which will be a features we will soon discuss.

### Components

You can create components that represent small or large parts of UI, examine the code below which will create an additional component where we will move our hello world code then return that component as JSX in our app component.

```js
//Hello World Component
const HelloWorld = props => <h1>Hello World</h1>

// THE APP COMPONENT
const App = props => {
  const hello = "hello world"

  return <HelloWorld />
}

// REACTDOM RENDER FUNCTION INSERT THE APP AND ITS CHILDREN TO THE DOM
ReactDOM.render(<App />, document.getElementById("app"))
```

Components are usually expressed as a self-closing tag as we see with hello world.

### Props

Components can become reusable and flexible using props which allows you to pass data as a "attirubute" of the tag. In the example below we now pass the text that the HelloWorld component will render as a prop so we can now use it different ways the multiple times we use it.

```js
//Hello World Component
const HelloWorld = props => <h1>{props.words}</h1>

// THE APP COMPONENT
const App = props => {
  const hello = "hello world"
  const bye = "goodbye world"

  return (
    <div>
      <HelloWorld words={hello} />
      <HelloWorld words={bye} />
    </div>
  )
}

// REACTDOM RENDER FUNCTION INSERT THE APP AND ITS CHILDREN TO THE DOM
ReactDOM.render(<App />, document.getElementById("app"))
```

As you can see here we are passing data from the App component to the HelloWorld component via a prop called "words", this is accessible to HelloWorld via the props object that is passed as an argument to the functional component. Any kind of data can be passed this way including functions, JSX, objects, arrays, etc.

## State

State are special variables that we create in React that get paired with it's own function to change it's value. In class components the state was a single object will all your variables in functional components each piece of state can get it's own variable and setter function. What makes state special is that when the state's value is changed using its setter function it causes the component that it belongs to rebuild itself and that components children reflecting the updated data (it's REACTive).

```js
//Hello World Component
const HelloWorld = props => (
  <div>
    <h1>{props.words}</h1>
    <button onClick={props.setter}>Click Me</button>
  </div>
)

// THE APP COMPONENT
const App = props => {
  const [hello, setHello] = React.useState("Hello World")
  const [bye, setBye] = React.useState("Goodbye World")

  return (
    <div>
      <HelloWorld
        words={hello}
        setter={() => {
          setHello("cheese")
        }}
      />
      <HelloWorld
        words={bye}
        setter={() => {
          setBye("cheese")
        }}
      />
    </div>
  )
}

// REACTDOM RENDER FUNCTION INSERT THE APP AND ITS CHILDREN TO THE DOM
ReactDOM.render(<App />, document.getElementById("app"))
```

So in this example we refactored our hello and bye variables into state using the useState hooks (any React function that starts with the word use is called a hook and supercharges our functional components). In this example we then passed the setter functions to the two instances of the HelloWorld component (they are wrapped in arrow functions cause often passing down hook functions directly runs into scoping issues, so passing an arror function that invokes the hook usually avoids this). After passing down the function in the HelloWorld component we created a button that then invokes the passed in function.

You'll notice when you click the button the text changes to cheese, what's happening is the function is invoking the setter function which sets the new value of the state to "cheese" which makes the App component re-render thus making the two HelloWorld components re-render since they are children of App.

### Bottom Line

React is a powerful library for creating rich complex UI that are quick and even quicker when you take advantage of the one directional encapsulated nature of Reacts library. (If you keep your state as low as possible in the component tree, changes in state only updates small portions of the UI allowing you to create even faster responsiveness in extra complex applications)

Hopefully this gives a good introduction to Reacts syntax and setting up a basic project.
