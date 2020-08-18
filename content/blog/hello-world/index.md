---
title: Hello World in Vue
date: "2020-08-17T22:12:03.284Z"
description: "Firs Blog Post and Vue Tutorial"
---

## Welcome

Welcome to my new Gatasby driven markdown blog! I'll be using this space mainly to create tutorials on different coding topics. In this first post I'll make an introductory tutorial to Vue.

## What is Vue?

From Vuejs.org:

> Vue (pronounced /vjuː/, like view) is a progressive framework for building user interfaces. Unlike other monolithic frameworks, Vue is designed from the ground up to be incrementally adoptable. The core library is focused on the view layer only, and is easy to pick up and integrate with other libraries or existing projects. On the other hand, Vue is also perfectly capable of powering sophisticated Single-Page Applications when used in combination with modern tooling and supporting libraries.

## Setup

We are going to setup a basic build using script tags this way no matter what your level you can appreciate how Vue works without having to discuss bundlers or node.

- in a folder somewhere on your computer create three files.
  - index.html
  - app.js
  - style.css

#### index.html

You just need to have your VUE script tag and the tags connecting your custom JS and CSS and you should be good to.

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Vue Practice</title>
    <!-- VUE SCRIPT TAG -->
    <script src="https://cdn.jsdelivr.net/npm/vue/dist/vue.js"></script>
    <!-- -------------------------------- -->
    <!-- YOUR CUSTOM CODE -->
    <script src="app.js" defer></script>
    <link rel="stylesheet" href="style.css" />
    <!-- -------------------------------- -->
  </head>
  <body></body>
</html>
```

The way this will work is we will create an html tag that the Vue instance will bind too unlocking all of Vue's special powers within that element.

```html
<body>
  <div id="app"></div>
</body>
```

#### app.js

Now we have to create the VueJS instance in our app.js file.

```js
const app = new Vue({el: "#app})
```

All the tools we can use in our html require us to pass information into that object in the Vue constructor. By the end of this tutorial that object will get pretty large. Right now the "el" property tells view which html element to monitor for Vue directives.

## Vue Features

### Interpolation

For our first features lets show you can interpolate data from your Vue instance into the DOM. Head over to app.js and add a data property to our Vue instance which will hold data we can use to interpolate, right now just a hello property.

```js
const app = new Vue({
  el: "#app",
  data: {
    hello: "Hello World",
  },
})
```

then make the following change in your HTML and then open index.html in the browser.

```html
<body>
  <div id="app">
    {{hello}} {{2+2}}
  </div>
</body>
```

You'll notice that in the browser the word hello gets replaced with "Hello World" and the 2+2 gets replaced with 4. Essentially the {{}} acts as an escape and you can reference any data in your data object or any valid javascript expression.

### Conditional Rendering

We can make the appearance of certain elements conditional based on variables or expressions. This uses the v-if directive.

for example add this property to your data object...

```js
const app = new Vue({
  el: "#app",
  data: {
    hello: "Hello World",
    show: true,
  },
})
```

```html
<body>
  <div id="app">
    {{hello}} {{2+2}}

    <h1 v-if="show">This may or may not show</h1>
  </div>
</body>
```

edit the show property to false and notice it dissapears. You can also put expressions in the v-if as well like if a certain variable is greater than or less than a set number.

### Looping over arrays

```js
const app = new Vue({
  el: "#app",
  data: {
    hello: "Hello World",
    show: true,
    numbers: [1,2,3,4,5,6,7,8,9]
  },
})
```

```html
<body>
  <div id="app">
    {{hello}} {{2+2}}

    <h1 v-if="show">This may or may not show</h1>

    <ul>
        <li v-for="num of numbers"> {{num}} </li>
    </ul>
  </div>
</body>
```

The v-for directive allows you loop an element one time each element in array. In this case we are looping over the numbers array we added in our data, then it will create one li for each item in numbers and that individual item will be accessible on each loop using the variable num (which can be whatever you want, choose something semantic of course).

### Binding Forms to Your Data and Events

Vue can make forms... a lot easier.

```js
const app = new Vue({
  el: "#app",
  data: {
    hello: "Hello World",
    show: true,
    numbers: [1,2,3,4,5,6,7,8,9]
    formName: "",
    formAge: 0
  },
  methods: {
      submitForm: function(){
          console.log(this.formName, this.formAge)
      }
  }
})
```

```html
<body>
  <div id="app">
    {{hello}} {{2+2}}

    <h1 v-if="show">This may or may not show</h1>

    <ul>
        <li v-for="num of numbers"> {{num}} </li>
    </ul>
    <input type="text" name="name" v-model="formName" />
    <input type="number" name="age" v-model="formAge" />
    <button v-on:click="submitForm">Submit</button>
  </div>
</body>
```

So the v-model directive bind the two input fields to the specified variables in data, when the form changes the variable changes and vice versa (two-way databinding).

We added another property to our Vue instance called methods which is an object with any functions we'd like to use via Vue directives. We bound this submitForm function using the v-on method which helps set event listeners to trigger Vue methods. V-on:click means the event is triggered by a click.

## Bottom Line

Hope fully this basic introduction shows you some of the cool features of Vue, now dig in to the Vue documentation at Vuejs.org.