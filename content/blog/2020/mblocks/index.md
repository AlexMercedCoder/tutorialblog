---
title: mBlocks - Frontend UI Library
date: "2020-08-22T22:12:03.284Z"
description: "Beginners Tutorial"
---

## What is mBlocks

In my journey building different frontend libraries to improve my own comfort with frontend development I made libraries like MercedUI and AMPonent that are built around the Web Component browser API. I wanted to try building a library that doesn't use the web component API to build reactive UI and this was my first attempt (I later created RenderBlocks).

*You can find this and my other libraries at AlexMercedCoder.com
*mBlocks Github Page: https://github.com/AlexMercedCoder/mBlocks/blob/master/block.js

## Setup

- in a folder somewhere on your computer create three files.
  - index.html
  - app.js
  - style.css

**index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Document</title>

    <!-- mBlocks -->
    <script
      src="http://www.alexmercedcoder.com/block.js"
      charset="utf-8"
      defer
    ></script>

    <!-- Your Code -->
    <script src="app.js" defer></script>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body></body>
</html>
```

## Your first block

The way m-blocks works is you bind an element to the instance and it will render a template to that element. To create a new block do the following.

**app.js**

```js
class HelloWorld extends Block {
  constructor(id) {
    super({
      //The Name of the Tag to look for <m-helloworld>
      name: "helloworld",
      //The Initial State
      state: {},
      //The id of particular element the instance will bind to
      id,
    })
  }

  //the builder function returns the template to be rendered
  builder(state, props) {
    return `<h1>Hello World</h1>`
  }
}

//Create an instance and bind to <m-helloworld id='hw'>
const hw = new HelloWorld("hw")
```

**index.html**

```html
<body>
  <m-helloworld id="hw"></m-helloworld>
</body>
```

## Props

Just like React, props can be passed in.

```js
class HelloWorld extends Block {
  constructor(id) {
    super({
      //The Name of the Tag to look for <m-helloworld>
      name: "helloworld",
      //The Initial State
      state: {},
      //The id of particular element the instance will bind to
      id,
    })
  }

  //the builder function returns the template to be rendered
  builder(state, props) {
    return `<h1>${props.hello}</h1>`
  }
}

//Create an instance and bind to <m-helloworld id='hw'>
const hw = new HelloWorld("hw")
```

```html
<body>
  <m-helloworld id="hw" hello="hello world"></m-helloworld>
</body>
```

## State

mBlocks has reactive state built in, and just like React triggers a re-render with every update as seen below. The assemble function runs after every render which is the perfect place to initialize new mBlock instances in the blocks template and wire necessary event listeners.

```js
class HelloWorld extends Block {
  constructor(id) {
    super({
      //The Name of the Tag to look for <m-helloworld>
      name: "helloworld",
      //The Initial State
      state: { hello: "Hello World" },
      //The id of particular element the instance will bind to
      id,
    })
  }

  //the builder function returns the template to be rendered
  builder(state, props) {
    return `<h1>${state.hello}</h1><button>Click Me</button>`
  }

  assemble(state, props) {
    const button = document.querySelector("button")
    button.addEventListener("click", () => {
      this.setState({ hello: "Goodbye World" })
    })
  }
}

//Create an instance and bind to <m-helloworld id='hw'>
const hw = new HelloWorld("hw")
```

## Conclusion

That's all there really is to mBlocks. It may not be as smooth as my web component libraries like MercedUI and AMPonent but you don't have to worry about browser compatibility of the Web Component API.
