---
title: Express Todo List for Beginners
date: "2022-04-06"
description: "Creating backend applications with Nodejs"
author: "Alex Merced"
category: "javascript"
bannerImage: "/images/postbanner/2022/batch-streaming.png"
tags:
  - backend
  - javascript
  - node
---

## What is a Web Server?

A web server or web application, is an application that runs and listens for incoming http requests and responds to them. Whenever you type a url into a url bar in the browser and hit enter, the browser on your behalf is sending a request to a web application somewhere that determines what to send back like an html file or JSON data.

If you've deployed soley frontend projects using Github pages, Netlify, or Vercel they allowed their own web application serve your files for you so you don't have to make your own. This works great for many use cases, but eventually you are going to need to run code that can't run in the browser for purposes such as:

- Making requests to databases or other web applications (Web APIs), where you'll likely want to hide credentials (nothing on the frontend is secret, nothing).

- Working with the file system to read and write files

- To run non-javascript code (a web server can be written in any language, frontend application must use javascript since the browser doesn't understand anything else)

## What is ExpressJS

As I mentioned, we can write a web server in any language and that includes javascript since we can run javascript outside of the browser using runtimes like NodeJS and Deno. In this tutorial we will do just that. If you ever use a different web framework in another language, you'll find many of the patterns in this tutorial still apply. I'll try to emulate the Object Oriented Patterns you may see in other frameworks like Rails, Lavavel and Django, but this isn't required for Express which gives you complete freedom to structure your files and project as you with.

## Getting Started

- Must have NodeJS installed and IDE (I'm using Visual Studio Code)

- Open your IDE to an Empty folder

- create a new node project with npm in terminal `npm init -y`

- install nodemon globally `npm install -g nodemon`

- install express for your project `npm install express`

- create a server.js file with the following code

```js
// import dependencies
const express = require("express")

// Create a new express application object
const app = express()

// run your application, so it listens on port 4444
app.listen(4444, () => {
    console.log("Server is Listening on port 4444")
})
```

In this code we create a new express application and turn it on. A web application listens for incoming messages to a particular port number (4444) on the host (the domain name, when running on our computer it will be "localhost" which is a psuedonym for 127.0.0.1 the IP address that always points to the computer you are currently on).

## Creating Some Scripts

NodeJS has a really cool feature in where we can define scripts in the package.json file. As you get more advance the commands to run your applications may get complicated, imagine something like this:

`NODE_ENV=development cross-env node server.js`

That's a lot to type so we can take that whole command and give an easy to run alias with scripts. In your package.json add the following scripts, your scripts sections will look like this.

```json
  "scripts": {
    "start": "node server.js",
    "dev": "nodemon server.js"
  },
```

Convention holds that the start script is used for the command to run the application in production, reason being is that start is the only script that can be run two ways `npm start` or `npm run start`. All other scripts must always be prefixed by `npm run` so the dev script would be run with `npm run dev`. Convention for "dev" is usually the command to run the application in "development" mode. 

For our purposes that means running the script with nodemon which watches for changes in our javascript files and will re-start the server whenever they change to allow updates to work right away, instead of us tediously having to turn off the server and restart it with each update (you wouldn't want this in production).

Now let's test out running the server: `npm run dev`

You should see our message in terminal stating the server is listening, let's confirm it by sending it a request with our browser. In your browser visit `localhost:4444` and you should see a screen saying `cannot GET /` which just means our server received the request but has no idea how to respond to it (which makes since since we never told our server how to respond to any requests).

## Your First Route

A route is an instruction to your server that boils down to, "If a request comes in for x run y function in response".

Http requests can have different methods (GET, PUT, POST, DELETE, etc.) so express gives a function to define how to respond.

```js
app.get("/test", (req, res) => {
    res.send("Hello")
})
```

The above is a pretty simple example of a route:

- app.get is the function telling express this is how you want it to handle a particular get request.

- "/test" tells the route what url it is meant to response to (GET requests sent to localhost:4444/test), this is also often referred to as the "endpoint" cause it's the end of the URL.

- The function often referred to as a controller or action dicates how the server should respond. This function is always passed two arguments:

    * `req`: This is the request object which has several properties with details on the incoming request

    * `res`: The response object which has several help methods for sending responses.

Routes should be defined after your application object is created but before your call to the listen method. Your server.js should look like this after adding the route above:

```js
// import dependencies
const express = require("express")

// Create a new express application object
const app = express()

//Routes
app.get("/test", (req, res) => {
    res.send("Hello")
})

// run your application, so it listens on port 4444
app.listen(4444, () => {
    console.log("Server is Listening on port 4444")
})
```

When you make the change you'll see nodemon restart the server in terminal and you can then visit localhost:4444/test in the browser.

## Serving Static Files

The simplest thing we can do is just deliver plain old HTML/CSS/JS files to the browser, these is referred to as serving static files since we are delivering the files unchanged.

The way this works is we'll define a folder as our static folder. Create a new folder called `static` in your project.

Then update your server.js like so:

```js
// import dependencies
const express = require("express")

// Create a new express application object
const app = express()

//middleware
app.use("/static", express.static("static"))

//Routes
app.get("/test", (req, res) => {
    res.send("Hello")
})

// run your application, so it listens on port 4444
app.listen(4444, () => {
    console.log("Server is Listening on port 4444")
})
```
The app.use function is for registering middleware which can literally be anything we want to happen after a request comes in but before a response is sent (in the middle). app.use can take two arguments, the endpoint and the middleware function. If the endpoint isn't given it will just default to "/". What this means is on any request to the specified endpoint occurs that middleware will run, in this case the built in static file serving middleware in express. 

So any request to a url that begins with "/static" will trigger this middleware to see if there is a file in the static folder to fulfill the request. To test this out in the static folder create an index.html and a cheese.html each with a basic h1.

/static/index.html
`<h1>Index</h1>`

/static/cheese.html
`<h1>Cheese</h1>`

If you now visit localhost:4444/static you should see the contents of index.html (index.html is always the default if a file isn't specified) and if you go to localhost:4444/static/cheese.html you'll see the contents of cheese.html. This is a pretty easy way to deliver html, css, js, images and any other files you can imagine and easily know what their URL will be.

Although wouldn't it be fun to do something a little more... dynamic?

## Templating

An html file won't change, so how about use code to create the HTML on the fly, this is called templating or server side rendering. To do this we usually use a specialized language for expressing the dynamic aspects of our html, these are called templating languages and there are probably dozens you can use with express such as EJS, Handlebars, Liquid, Mustache, Pug, express-react-views and so many more.

[Cheatsheet for Javascript Templating Libraries](https://tuts.alexmercedcoder.com/2021/10/express_templating_cheatsheet/)

For this tutorial we will use EJS as it is the easiest to configure and it pretty just let's you use javascript to express your templating logic. All we really need to use EJS is just... install it.

Shut down your server by press `ctrl+c` and then run the command `npm install ejs`. You should see everything you install (except global installs) being added into your package.json under the dependencies section. If you want more of a deeper dive into Node overall, watch [this video](https://www.youtube.com/watch?v=nWjBkjyEJyY).

You may have noticed earlier we used a function `res.send` in the test route we created, this is a function for sending any kind of response. If we sent a string with some html, it'd be treated as html, if we send text it's treated as text, we send an array or js object it is turned into JSON. For rendering templates we use `res.render` which takes two arguments.

- The template to render (it will by default look for a "views" folder with the file)
- a javascript object with data which the template can use when you refer to variables in the template

So following the following steps:

- create a `views` folder

- in the `views` folder  and in create a file called index.ejs

(by default express assumes the file extension is the name of the engine, so by calling them ejs files we don't have to do any special configuration for all this to work.)

In the index.ejs put in the following html.

```html
<h1><%= name %>'s todo list</h1>
```
Notice this syntax `<% ---- %>`, that's EJS syntax. Essentially the server when we use `res.render` will pass the ejs file and javascript object we'll give it to be rendered into a finished html file. Anywhere with EJS syntax will be replaced with the result of the logic we put in the file, and that result is the html sent to the end user, they never see the templating langauge or know that it was used.

Quick Summary

- `<% --- %>` for using javascript logic like for loops and ifs
- `<%= ---- %>` to inject the result of the javascript or variable reference as text into the html
- `<%- ---- %>` for using some special EJS features like partials, will discuss later.

Now let's see this template at work and update your server.js like so then run your server with `npm run dev`.

```js
// import dependencies
const express = require("express")

// Create a new express application object
const app = express()

//middleware
app.use("/static", express.static("static"))

//Routes
app.get("/test", (req, res) => {
    res.send("Hello")
})

app.get("/", (req, res) => {
    res.render("index.ejs", {
        name: "Alex Merced"
    })
})

// run your application, so it listens on port 4444
app.listen(4444, () => {
    console.log("Server is Listening on port 4444")
})
```

You can change the name in the Javascript object to your name, but now if you visit `localhost:4444` you should see the name variable being replaced by the content of name property in the object, how cool is that!

## Partials

Notice we don't have a `<head>` tag in our html, but wouldn't it be tedious to have to write the tag in each ejs file. EJS has a feature called partials where we can use individual EJS files as building blocks in other EJS files (and they'll have access to the javascript variables provided too).

- In our views folder create a folder called partials and in it create a `views/partials/head.ejs` with the following:

```html
<head>
    <title><%= name %>'s todo list</title>
</head>
```

- Now let's update the `views/index.js` file to use that file as a building block.

```js
<%- include("partials/head.ejs") %>

<h1><%= name %>'s todo list</h1>
```

Now if you head back to `localhost:4444` you'll see that the title in tab is now showing the title from our head.ejs. This is a great way to avoid having to rewrite code for things that appear on multiple pages of your website. Reusability and Encapsulation is a developers best friend.

## Styling the Page

You have a few choices on you may want to style the page.

1. Style tags in the html

```js
<%- include("partials/head.ejs") %>

<h1><%= name %>'s todo list</h1>

<style>
    h1 {
        color: red;
    }
</style>
```

This is fine if you only have a few pages on the site, but having to copy and paste the same styles from page to page is not maintainable if you have a lot of pages, you'll want to use a CSS file.

`static/styles.css`
```css
h1 {
    color: red
}
```

2. CSS files, just link to them like usual. If you want to link to a local stylesheet, the best way to do it is to put the style sheet in your static folder.

- create a styles.css inside your static folder.

```css
h1 {
    color: red
}
```

We know from earlier the url will be `/statics/styles.css` so let's use that to link it up in our head.ejs.

```js
<head>
    <title><%= name %>'s todo list</title>
    <link rel="stylesheet" href="/static/styles.css">
</head>
```

Now the styling should apply to any page that includes the head.ejs, pretty cool. This pattern also works for javascript files or images you want to reference in your html, just put them in the static folder.

## Building our todo list

In our server.js we will do the following:

- Create an array to hold our todos (keep in mind, we aren't using a database so all the todos will reset whenever the server restarts)

- Add a route to receive form submissions, this is usually done using `POST` requests. We'll need to add some middleware to read the form data, forms usually submit data in a urlencoded format, for example `name=Alex&age=36`. The middleware will parse the data and store it in the request object under `req.body`.

- We'll also add the array of todos as something we will send the index.ejs file when we render it.

The result should look like this:

```js
// import dependencies
const express = require("express")

// Create a new express application object
const app = express()

// Array for Todos
const todos = []

//middleware
app.use("/static", express.static("static"))
app.use(express.urlencoded({extended: true}))

//Routes
app.get("/test", (req, res) => {
    res.send("Hello")
})

app.get("/", (req, res) => {
    res.render("index.ejs", {
        name: "Alex Merced",
        todos: todos
    })
})

app.post("/", (req, res) => {
    // push new todo into array
    todos.push(req.body)
    // redirect back to main page (refresh page)
    res.redirect("/")
})

// run your application, so it listens on port 4444
app.listen(4444, () => {
    console.log("Server is Listening on port 4444")
})
```

Update index.ejs like so:

```js
<%- include("partials/head.ejs") %>

<h1><%= name %>'s todo list</h1>

<h3> Add a new todo </h3>

<form action="/" method="post">
    <input type="text" name="text">
    <input type="submit">
</form>

<ul>

<% for (todo of todos) { %>

    <li class="todo"><%= todo.text %></li>

<% } %>

</ul>
```

A few points of to highlight:

- The name property in the text input is important as that is what determines where the data will show up in req.body when you submit the form.

- The for loop will generate the html inside once for each todo in the array

Now you should be able to go to `localhost:4444` and add todos and see them on the screen how cool.

## Crossing them out

We may want to use some frontend javascript to add some interactivity to the page, like clicking on a todo and crossing it out. Let's demonstrate.

- create `/static/app.js`

- in head.ejs let's connect the app.js, don't forget the defer keyword so the script doesn't run till after all the initial html has loaded.

```html
<head>
    <title><%= name %>'s todo list</title>
    <link rel="stylesheet" href="/static/styles.css">
    <script src="/static/app.js" defer></script>
</head>
````

- add the following to the app.js

```js
// grab all the todos by class
const todos = document.querySelectorAll(".todo")

// add a click event to each of them
for (todo of todos){
    todo.addEventListener("click", () => {
        todo.style.textDecoration = "line-through"
    })
}
```

Keep in mind, DOM manipulation like this can only happen in frontend javascript, which is any javascript ran in the browser. You can tell it's run in the browser cause it is run by a script tag in an html file. (so the code runs when a user loads the html in browser versus our server.js which runs when node runs it outside the browser).

## Deployment

Deployment using a tool like Heroku is pretty easy, you can just [follow this guide](https://main.grokoverflow.com/posts/2021/04-ultimate-guide-heroku-node-deployment).

## Conclusion

Hopefully this gave you a nice taste of ExpressJS and writing backend web servers. For more on express checkout [this playlist](https://youtube.com/playlist?list=PLY6oTPmKnKbamIu4uuDJ3QNNDU1SoOkjl).

[Repository with Final Result](https://github.com/AlexMercedCoder/express-todo-tutorial-result)