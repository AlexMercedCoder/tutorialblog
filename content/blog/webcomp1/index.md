---
title: Web Components Part 1 - The Basics
date: "2020-08-26T22:12:03.284Z"
description: "Creating, ShadowDOM"
---

## What is a Web Component

In the major frontend frameworks (Angular, Vue, React) you are able to encapsulate parts of your user interface into tags like `<component/>`. In recent years, the ability to do so natively has been added to the Javascript browser API in the form of the Native Web Components API. In this series we'll explore the different aspects of building web components. I have created a few libraries that makes this process even easier such as MercedUI, ComponentZoo, FunComponent, and AMPonent.

**Find my libraries at** http://alexmercedcoder.com/jslib/

**My Web Components Video Playlist:** https://www.youtube.com/watch?v=qV7jh7ctALg&list=PLY6oTPmKnKbaNVkXHOHWxgdKEZLGKuFP9

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
    <script src="app.js" defer></script>
  </head>
  <body></body>
</html>
```

## A Hello World Component

Add this code to your app.js and we'll explain what it does...

```js
class HelloWorld extends HTMLElement {
  constructor() {
    super()
    this.innerHTML = `<h1>Hello World</h1>`
  }
}

customElements.define("hello-world", HelloWorld)
```

So when you create a component the first thing you need to do is create a new class that inherits from HTMLElement or from a class that is a child of HTMLElement. We then create the constructor where we as always need to first invoke the parent constructor using `super()`. At this point the absolute simplest thing we can do is put some html in the component by passing a string to `this.innerHTML`.

Once the class is created we need to register it with the browser so it knows to instantiate this class when it sees a particular tag. `customElements.define` is the function that registers the new element. The first argument is the tag name which MUST be kebab case (firstWord-secondWord). The second argument is the class that is used when rendering the element.

Now let's test it out in our HTML.

```html
<body>
  <hello-world></hello-world>
</body>
```

## ShadowDOM

The way we included the HTML in our previous version of the component makes the h1 part of the standard DOM meaning any stylesheets will have a direct effect of the element, this is fine if this is what you intend. The main purpose of web components is often to create encapsulated UI that is independant of your project specific code.

The ShadowDOM is a feature we can add to our web component that allows us to create a little mini-dom that lives with our component that is not affected by outside styles or code. It does require us to template our component a little differently.

```js
class HelloWorld extends HTMLElement {
  constructor() {
    super()
    //Add ShadowDOM to Component
    this.attachShadow({ mode: "open" })
    //Add template to shadowDOM
    this.shadowRoot.innerHTML = `<h1>Hello World</h1>`
  }
}

customElements.define("hello-world", HelloWorld)
```

If you open up the elements section of chrome you'll notice the components element shows up under a special section that is its shadowDOM.

## Using Attributes(Props)

You can grab attributes on the element like props in react to use in your component using the getAttribute function. See the below code snippet to see an example.

```js
class HelloWorld extends HTMLElement {
  constructor() {
    super()
    //Grabbing our Prop
    const myProp = this.getAttribute("myProp")
    console.log(myProp)
    //Add ShadowDOM to Component
    this.attachShadow({ mode: "open" })
    //Add template to shadowDOM
    this.shadowRoot.innerHTML = `<h1>Hello World</h1><h2>${myProp}</h2>`
  }
}

customElements.define("hello-world", HelloWorld)
```

Here is the prop in the HTML

```html
<body>
  <hello-world myProp="hello"></hello-world>
</body>
```

So as you can see the prop gets saved in a variable, then using template literals is interpolated into the template string. This pattern allows us to make our components more dynamic. We can pass in urls, css properties, strings of html and javascript and all sorts of fun things in this manner.

## Bottom Line

The Web Component API really opens the door of creating portable UI pieces cross framework. Since this is just native javascript with a mere script tag these components can be loaded into your next Angular, Vue, or React project alongside your framework specific code.
