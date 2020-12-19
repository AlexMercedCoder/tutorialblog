---
title: RenderBlocks
date: "2020-08-23T22:12:03.284Z"
description: "Beginners Tutorial"
---

## What is RenderBlocks

In my journey building different frontend libraries to improve my own comfort with frontend development I made libraries like MercedUI and AMPonent that are built around the Web Component browser API. After creating mBlocks, I really liked the functioning of a basic Vue instance relying on its constructor function and tried to create something similar with RenderBlocks.

*You can find this and my other libraries at AlexMercedCoder.com
*RenderBlocks Github Page: https://github.com/AlexMercedCoder/RenderBlocks

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
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Document</title>
    <!-- RENDERBLOCKS -->
    <script src="http://www.alexmercedcoder.com/renderBlocks.js" charset="utf-8" defer></script>
    <!-- YOUR CODE -->
    <script src="app.js" defer></script>

    
</head>
<body>
    
</body>
</html>
```

## Your First Block

The way it works is a RenderBlock renders a template to a target element. At minimum you pass in the CSS Selector for the target element and a function that renders the template.

**app.js**
```js
const app = new RenderBlock({
    target: "#app",
    render: block => `<h1>Hello World</h1>`
})
```

**index.html**
```html
<body>
    <div id="app"></div>
</body>
```

## Props

Of course, you can pass in props via the target element.

```html
<div id="app" hello="Hello World"></div>
```

```js
const app = new RenderBlock({
    target: "#app",
    render: block => {
        const {props} = block

        return `<h1>${props.hello}</h1>`
    }
})
```

## Info

Info is like state in React or data in Vue, Reactive Variables. The UpdateInfo Function allows you to update info and cause a re-render of the template.

```js
const app = new RenderBlock({
    target: "#app",
    render: block => {
        const {props, info} = block

        return `<h1>
        ${props.hello}
        </h1>
        <button>
        ${info.button}
        </button>`
    },
    info: {
        button: "Click Me"
    },
    after: (block) => {
        document.querySelector('button').addEventListener('click', () => {
            block.updateInfo('button', 'I have been clicked')
        })
    }
})
```

Notice we destructure props and info out of Block to make it easier to interpolate it into the template. The after property is a lifecycle function the runs after every render in this case adding the event listener to the button. Since the block itself is passed into every function, the updateInfo function is called. Notice it works differently than in react or vue, updateInfo allows you to update one property at a time by specifying a key and the new value.

## Bottom Line

This is the basics of how to use RenderBlocks. It has also has a methods property for writing additional methods along with several lifecycle functions. Check it out, it was a fun library to create.