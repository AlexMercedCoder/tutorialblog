---
title: Web Components Part 3 - Lifecycle Functions
date: "2020-09-05T22:12:03.284Z"
description: "Built in functions that run at certain points"
---

## What is a Web Component

In the major frontend frameworks (Angular, Vue, React) you are able to encapsulate parts of your user interface into tags like `<component/>`. In recent years, the ability to do so natively has been added to the Javascript browser API in the form of the Native Web Components API. In this series we'll explore the different aspects of building web components. I have created a few libraries that makes this process even easier such as MercedUI, ComponentZoo, FunComponent, and AMPonent.

**Find my libraries at** http://alexmercedcoder.com/jslib/

**My Web Components Video Playlist:** https://www.youtube.com/watch?v=qV7jh7ctALg&list=PLY6oTPmKnKbaNVkXHOHWxgdKEZLGKuFP9

## Where we left off

In this tutorial we won't be continuing off the build of the previous two tutorials but just going over some additional built in functions you can override in your web component classes.

**example**

```js

class MyComponent extend HTMLElement {
  constructor(){
    super()
  }

  static get observedAttributes(){return ['prop1','prop2']}

  connectedCallback(){
    console.log('I run when the component is rendered')
  }

  disconnectedCallback(){
    console.log('I run when the component is removed from the DOM')
  }

  changedAttributeCallback(name, oldVal, newVal){
    switch(name){
      case 'prop1':
        console.log('I run when the prop1 attribute is changed');
        break;
      case 'prop2':
        console.log('I run when the prop2 attribute is changed');
        break;
    }
  }
}


```

If you read the console.logs above it should be clear what each of these functions do. There is also an adoptedCallback that would run if you have iframes on your page and you move a component from your main document into one of the iframe documents.
