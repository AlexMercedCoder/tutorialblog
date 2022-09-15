---
title: Web Components Part 2 - Styling and Slots
date: "2020-08-27T22:12:03.284Z"
description: "Making Pretty and Flexible Components"
---

## What is a Web Component

In the major frontend frameworks (Angular, Vue, React) you are able to encapsulate parts of your user interface into tags like `<component/>`. In recent years, the ability to do so natively has been added to the Javascript browser API in the form of the Native Web Components API. In this series we'll explore the different aspects of building web components. I have created a few libraries that makes this process even easier such as MercedUI, ComponentZoo, FunComponent, and AMPonent.

**Find my libraries at** http://alexmercedcoder.dev/jslib/

**My Web Components Video Playlist:** https://www.youtube.com/watch?v=qV7jh7ctALg&list=PLY6oTPmKnKbaNVkXHOHWxgdKEZLGKuFP9

## Where we left off

In the first part of this tutorial the end result was the follow

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
  <body>
    <hello-world myProp="hello"></hello-world>
  </body>
</html>
```

**app.js**

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

## Styling

There are several different choices for styling your components which you can choose or combine.

- external stylesheet
- style tag
- parts

### External Stylesheet

You can use a link tag in your template in the same way you'd use it in an HTML file and link it to an external stylesheet. Only downside is now you need two files if you keep all your JS and CSS locally.

make a file ext.css

```css
h1 {
  color: green;
}
```

In your app.js

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
    this.shadowRoot.innerHTML = `
        <link rel="stylesheet" href="ext.css"><h1>Hello World</h1><h2>${myProp}</h2>`
  }
}

customElements.define("hello-world", HelloWorld)
```

### Style Tag

You could also just include a style tag in your template.

Your app.js

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
    this.shadowRoot.innerHTML = `
        <style>h1 {color: red;}</style><h1>Hello World</h1><h2>${myProp}</h2>`
  }
}

customElements.define("hello-world", HelloWorld)
```

### Parts

You can allow the styling to be done using parts by global style sheets. So if certain element you want people using your components to be able to style you can give them a part label.

**app.js**

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
    this.shadowRoot.innerHTML = `
        <h1 part="h1">Hello World</h1><h2>${myProp}</h2>`
  }
}

customElements.define("hello-world", HelloWorld)
```

**Create a style.css and link to it in your index.html**

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Document</title>
    <script src="app.js" defer></script>
    <link rel="stylesheet" href="style.css" />
  </head>
  <body>
    <hello-world myProp="hello"></hello-world>
  </body>
</html>
```

**style.css**

```css
::part(h1) {
  color: purple;
}
```

Using the part psuedo selector you can select any element that is given a part even if its hidden away in a shadowDOM. Essentialy, part allows you to expose certain element to the global style sheet.

## Slots

Slots are places where children tags will render. Watch what happens when we make the following changes.

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
    this.shadowRoot.innerHTML = `
        <h1 part="h1">Hello World</h1><slot></slot><h2>${myProp}</h2>`
  }
}

customElements.define("hello-world", HelloWorld)
```

**index.html**

```html
<body>
  <hello-world myProp="hello">
    <h3>I've been slotted!</h3>
  </hello-world>
</body>
```

### Named Slots

You can have multiple slots, just have to give them a name.

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
    this.shadowRoot.innerHTML = `
        <h1 part="h1">Hello World</h1><slot></slot><h2>${myProp}</h2><slot name="other"></slot>`
  }
}

customElements.define("hello-world", HelloWorld)
```

**index.html**

```html
<body>
  <hello-world myProp="hello">
    <h4 slot="other">I'm in a named slot</h4>
    <h3>I've been slotted!</h3>
  </hello-world>
</body>
```

Notice that even though the h4 is in the html before the h3 the h4 appears second since it has been specified to appear in the named slot.

### Styling slotted element

Since slotted elements don't exist in the ShadowDOM to style them require some special selectors in your component internal styles, the ::slotted psuedo selector.

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
    this.shadowRoot.innerHTML = `
        <style>::slotted(*){color: red;}</style>
        <h1 part="h1">Hello World</h1><slot></slot><h2>${myProp}</h2><slot name="other"></slot>`
  }
}

customElements.define("hello-world", HelloWorld)
```

The \* passed in the slotted selector applies the style to any slotted element, you can replace it with h3 or h4 and see it only apply to specific elements.

Couple of things to keep in mind...

- Only applies to top level elements, can't target children of slotted element.

- One workaround is inserting a style tag into the document that styles special classes you add to your slotted elements (It should be inserted into the body as inserting into the component will disable the slots)

**example**

```js
const lightStyle = document.createElement("style")
lightStyle.innerText = `.cheese {color: red;}`
document.querySelector("body").appendChild(lightStyle)
```

## Bottom Line

Web Components along with ShadowDOM give you a lot of a flexibility in creating encapsulated UI using native javascript. Give it a shot, I think you'll like. In the next article in this series we'll talk about lifecycle methods.
