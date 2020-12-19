---
title: AMPonent, Webcomponent Building Library
date: "2020-08-19T22:12:03.284Z"
description: "Building Reactive and Styling UI Components"
---

## What is AMPonent?

AMPonent is my newest Web Component library that allows you to create Web Components with super powers with ease. It bakes in things like reactive data, reducers, styled components and lifecycle functions in a nice function based approach.

*You can find this and my other libraries at AlexMercedCoder.com
*AMPonent github page: https://github.com/AlexMercedCoder/Ponent

## Setup

- in a folder somewhere on your computer create three files.
  - index.html
  - app.js
  - style.css

#### index.html

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Document</title>
    <!-- AMPONENT LIBRARY -->
    <script
      src="http://www.alexmercedcoder.com/ponent.js"
      charset="utf-8"
      defer
    ></script>
    <!-- YOUR JS FILE -->
    <script src="app.js" defer></script>
    <!-- YOUR CSS FILE -->
    <link rel="stylesheet" href="style.css" />
  </head>
  <body></body>
</html>
```

#### app.js

Let's start out by creating the simplest component possible... Hello World!

```js
AMPonent.make("hello-world", {
  render: (box, props) => `Hello World`,
})
```

then back in your HTML

```html
<body>
  <hello-world></hello-world>
</body>
```

You should now see Hello World on the screen, Huzzah! Now notice the function you pass into render gets to parameters, box and props. box is similiar to state in react or data in vue, it's the data store for the component and when that data changes the component will re-render.

## Using Props

So let's test out using props. Unlike react, all props are strings so you can't pass functions or objects via props but you can certainly use it to make many aspects of your component customizable.

```js
AMPonent.make("hello-world", {
  render: (box, props) => `${props.hello}`,
})
```

then back in your HTML

```html
<body>
  <hello-world hello="hello world"></hello-world>
</body>
```

Now you should still be able to see hello world on the screen but now its showing up because the hello prop was interpolated into the template.

## The Box

Let's use the box, we'll serve the hello world screen from box and add the logic to create a button and use the after function to assign an event listener. The stuffBox functions works like setState in React class components where it merges the new and old box and re-renders the component.

```js
AMPonent.make("hello-world", {
  render: (box, props) => `<h1>${box.hello}</h1>
    <button id="testbox">Click Me</button>`,
  box: {
    hello: "hello world",
  },
  after: function () {
    const component = this
    component.$s("#testbox").addEventListener("click", function () {
      component.stuffBox({ hello: "goodbye world" })
    })
  },
})
```

So when planning to use this or the stuffBox function it is wise to use the function(){} syntax vs arrow function syntax. To keep things simple I bind this immediately to a variable (I usually use c, but for clarity I used component). Things to notice...

- the $s function is a built in methods which essentially allows you to use this.shadowRoot.querySelector without typing as much (these components always use shadowdom). There is also $sa (querySelectorAll) and \$id (getElementById) and this just makes working with shadowDOM a little less verbose.

## Styling your component

You can add a pretty property which is a function to pass in styles for your component and you can use your props and box variables in there too.

```js
AMPonent.make("hello-world", {
  pretty: (box, props) => `h1 {color: ${props.h1}}`,
  render: (box, props) => `<h1>${box.hello}</h1>
    <button id="testbox">Click Me</button>`,
  box: {
    hello: "hello world",
  },
  after: function () {
    const component = this
    component.$s("#testbox").addEventListener("click", function () {
      component.stuffBox({ hello: "goodbye world" })
    })
  },
})
```

```html
<body>
  <hello-world h1="red"></hello-world>
  <hello-world h1="green"></hello-world>
  <hello-world h1="purple"></hello-world>
</body>
```

Now you'll see that the hello world is in different color depending what you pass in. This makes it very easy to create customizable components.

## Creating Styled Components

If you want create components that style their children you can use the makeStyle function, check out the code below.

```js
AMPonent.makeStyle("colored-h1", "h1", "color: red;")
```

this basic line above allow you to use the follow element that will style direct child which are h1's.

```html
<colored-h1><h1>I am being styled</h1></colored-h1>
```

## Bottom Line

AMPonent allows you to make very powerful web components in a very Vue/React type manner. We only scratched the surface in this tutorial, check out the documentation and see what amazing web components you can make that you can use from project to project.
