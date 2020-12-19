---
title: MercedUI - Web Components with Super Powers
date: "2020-08-22T22:12:03.284Z"
description: "Beginners Tutorial"
---

## What is MercedUI

MercedUI is the first UI library I created for helping create Web Components and remains one of my most robust and feature full libraries. In this tutorial I hope to show you the basics of making a web component with MercedUI.

*You can find this and my other libraries at AlexMercedCoder.com
*MercedUI Github Page: https://github.com/AlexMercedCoder/MercedUI

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
    <title>MercedUI</title>

    <!-- MERCEDUI -->
    <script src="http://www.alexmercedcoder.com/UI.js" charset="utf-8" defer></script>

    <!-- MY CODE -->
    <script src="app.js" defer></script>
    <link rel="stylesheet" href="style.css">
</head>
<body>
    
    
</body>
</html>
```

## Your First Component

In the MercedUI library there are several classes and functions available for making web components but let's focus this tutorial on the MercedElement base class by making a basic Hello World component. Notice the super function in the constructor takes three argument.

1. Builder Function - a function that returns the template string for rendering the component
2. The Initial State - The initial state, works just like Reacts state
3. Reducer - A redux like reducer function built into the component


**app.js**
```js
class HelloWorld extends MercedElement {
    constructor(){
        super(
            //the builder function
            (state, props) => `<h1>Hello World<h1>`,
            //the state
            {}
        )
    }
}

MercedElement.makeTag('hello-world', HelloWorld)
```

The MercedElement class has several static functions, one of them being makeTag to make it easy to register the element with the DOM. Now let's add the component into our HTML.

```html

<body>

    <hello-world></hello-world>
    
</body>

```

## Props

Just like React, components made with the MercedElement base class can be passed in props via the HTML tag. Being a web component, only strings can be passed this way but it still can be quite powerful.

```js
class HelloWorld extends MercedElement {
    constructor(){
        super(
          //The Builder Function
            (state, props) => `<h1>${props.hello}<h1>`,
          //The State
            {}
        )
    }
}

MercedElement.makeTag('hello-world', HelloWorld)
```

```html
<body>
    
    <hello-world hello="hello world"></hello-world>
    
</body>
```

## State

Just like React, MercedElement can store data in an object called state that is updated by a setState function that triggers a rebuild of the component. In the example below we'll override the postBuild function which runs after every render as the best place to add event listeners onto our template. MercedUI also has an abbreviated syntax for normal DOM functions using $m for functions regarding the normal DOM and $s for shadowDOM you'll see used below.

```js
class HelloWorld extends MercedElement {
    constructor(){
        super(
            //The Builder Function
            (state, props) => `<h1>${state.hello}<h1><button>Click Me</button>`,
            //The State
            {hello: "Hello World"}
        )
    }

    postBuild(state, props){
        //Select the button from the shadowDOM
        const button = $s.select(this, 'button')
        //Add an event listener
        button.addEventListener('click', () => {
            this.setState({hello: "Goodbye World"})
        })
    }
}

MercedElement.makeTag('hello-world', HelloWorld)

```

Now you should see that when you click the button, the state gets updated updating the DOM. Nice!

## Other MercedUI Features

This really only scratches the surface of the power of the MercedElement base class which also...

- Has a global state you can register components with
- The global state also has a redux like dispatch capability
- Lifecycle functions

The MercedUI Library also has many more fun features as well

- SiteBuilder class which bind a template to an existing HTML element
- FormTool class which bind to a form making extracting form data... easy
- getQueryHash function for easily extracting URL queries
- captureProps for easily grabbing the properties of any element
- MUIRequest, a version of fetch that automatically parses the response as JSON
- makeComponent, a function for building very simple components
- makeLiveComponent, a function for making simple but reactive components
- globalStore, creates a globalStore object with which you can register components as a global state
- gsReducer, like globalStore but with more of a redux like reducer/dispatch setup
- mapToDom, iterates over an array to create a template and renders it target element
- bindData, same as mapToDom but returns a function to trigger re-renders when data changes
- createRotator, rotates through assigned templates like a router
- mapToString, like mapToDom but returns a string to be included in other templates
- m-router and m-link which work like React Router