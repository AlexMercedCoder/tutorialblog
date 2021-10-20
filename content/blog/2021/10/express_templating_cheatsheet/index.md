---
title: Express Templating Cheatsheet
date: "2021-10-19T12:12:03.284Z"
description: Sever Side Rendering for All the People!
---

# Intro

Express can be used several different templating engines, most engines will assume by default that all your templates are in a "views" folder. To render a template you'll use the render function in side the response object in your express routes.

```js
res.render("template.extension", {data: [1,2,3,4]})
```

Render will search for a template file called "template.extension" in the views folder and pass the object to the template engine to use when rendering the template.


# LiquidJS
[LiquidJS Documentation](https://liquidjs.com/tutorials/intro-to-liquid.html)

LiquidJS is the javascript implementation of popular ruby based Liquid templating system used by Shopify. Here is how to use it in your express apps.

1. install `npm install liquid-express-views`
2. configure the template engine

```js
// Import express
const express = require("express")
// import path from node standard library
const path = require("path")
// create our application object (and configure liquid templating)
// passing the app object to the l-e-v function first and then saving to the app variable
const app = require("liquid-express-views")(express(), {root: [path.resolve(__dirname, 'views/')]})
```

*these settings will assume all your templates to be within a "views" folder

### Injecting Variables

Use double curly brackets to inject data. Given this call to render.

```js
res.render("template.liquid", {name: "Alex Merced"})
```

Use the name property in the template like so:

```html
<h1>I am {{name}}</h1>
```

### Looping through an array


Use the for tag to loop over an array of data. Given this call to render.

```js
res.render("template.liquid", {names: ["Alex", "Beth", "Connor"]})
```

Use the names array in the template like so:

```html
<ul>
  {% for name in names %}
    <li>{{name}}</li>
  {% endfor %}
</ul>
```
### Conditional render


Use the if tag to render html conditionally. Given this call to render.

```js
res.render("template.liquid", {name: "Alex Merced", show: true})
```

conditional logic would be done like so:

```html
{% if show == true %}
  <h1>{{name}}</h1>
{% else %}
  <h1>Not sure who you've talking about</h1>
{% endif %}
```


# EJS (Embedded Javascript)
[EJS Documentation](https://ejs.co/)

EJS is a templating language that allows you to write javascript in your templates.

1. install `npm install ejs`
2. ejs works out of the box with express long as your ejs files are in the views folder and have an ejs extension

### Injecting Variables

Use `<%= %>` to inject data. Given this call to render.

```js
res.render("template.ejs", {name: "Alex Merced"})
```

Use the name property in the template like so:

```html
<h1>I am <%= name %></h1>
```

### Looping through an array


Write a standard js loop with `<% %>` tags. Given this call to render.

```js
res.render("template.ejs", {names: ["Alex", "Beth", "Connor"]})
```

Use the names array in the template like so:

```html
<ul>
  <% for (name of names){ %>
    <li><%= name %></li>
  <% } %>
</ul>
```
### Conditional render


Write a standard js if statement with `<% %>` tags. Given this call to render.

```js
res.render("template.ejs", {name: "Alex Merced", show: true})
```

conditional logic would be done like so:

```html
<% if (show){ %>
  <h1><%= name %></h1>
<% } else { %>
  <h1>Not sure who you've talking about</h1>
<% } %>
```

# Mustache
[Mustache Documentation](https://github.com/janl/mustache.js)

1. Install `npm install mustache-express`
2. configure in express

```js
// We are importing the express library
const express = require("express")

//import mustache-express
const mustache = require('mustache-express')

// We use express to create an application object that represents our server
const server = express()

// We Tell Express to Look for mustache files when we use the render function
// templates are by default looked for in the views folder
server.engine('mustache', mustache()) //Change the view engine
server.set("view engine", "mustache")
```

### Injecting Variables

Use double curly brackets to inject data. Given this call to render.

```js
res.render("template.mustache", {name: "Alex Merced"})
```

Use the name property in the template like so:

```html
<h1>I am {{name}}</h1>
```

### Looping through an array

Given this call to render.

```js
res.render("template.mustache", {names: ["Alex", "Beth", "Connor"]})
```

Use the names array in the template like so:

```html
<ul>
  {{#names}}
    <li>{{.}}</li>
  {{/names}}
</ul>
```
### Conditional render


Given this call to render.

```js
res.render("template.mustache", {name: "Alex Merced", show: true})
```
conditional logic would be done like so:

```html
  {{#show}}
  <h1>{{name}}</h1>
  {{/show}}
```

# Pug
[Pug Documentation](https://pugjs.org/api/getting-started.html)

1. install `npm install pug`
2. configure in express

```js
// We are importing the express library
const express = require("express")

// We use express to create an application object that represents our server
const server = express()

// Set the view engine to pug
server.set('view engine', 'pug')
```

### Injecting Variables

Use double curly brackets to inject data. Given this call to render.

```js
res.render("template.pug", {name: "Alex Merced"})
```

Use the name property in the template like so:

```pug
h1 #{name}
```

### Looping through an array

Given this call to render.

```js
res.render("template.pug", {names: ["Alex", "Beth", "Connor"]})
```

Use the names array in the template like so:

```pug
ul
  each name in names
    li= name
```
### Conditional render


Given this call to render.

```js
res.render("template.pug", {name: "Alex Merced", show: true})
```
conditional logic would be done like so:

```pug
if show
  h1 #{name}
else
  h1 don't know who your talking about
```

# Handlebars
[Handlebars Documentation](https://handlebarsjs.com/)

1. Install `npm install express-handlebars`
2. configure in express

```js
// We are importing the express library
const express = require("express")

//import mustache-express
const handlebars = require('express-handlebars')

// We use express to create an application object that represents our server
const server = express()

// We Tell Express to Look for mustache files when we use the render function
// templates are by default looked for in the views folder
server.engine('handlebars', handlebars()) //Change the view engine
server.set("view engine", "handlebars")
```

### Injecting Variables

Use double curly brackets to inject data. Given this call to render.

```js
res.render("template.handlebars", {name: "Alex Merced"})
```

Use the name property in the template like so:

```js
<h1>I am {{name}}</h1>
```

### Looping through an array

Given this call to render.

```js
res.render("template.handlebars", {names: ["Alex", "Beth", "Connor"]})
```

Use the names array in the template like so:

```js
<ul>
  {{#each names}}
    <li>{{this}}</li>
  {{/each}}
</ul>
```
### Conditional render


Given this call to render.

```js
res.render("template.handlebars", {name: "Alex Merced", show: true})
```
conditional logic would be done like so:

```js
  {{#if show}}
  <h1>{{name}}</h1>
  {{/if}}
```