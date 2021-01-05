---
title: Understanding MVC (Models - Views - Controllers)
date: "2021-05-01T12:12:03.284Z"
description: Web Application Architecture
---

## Why Does MVC Matter?

At the end of the day code allows you to do anything and organize your code anyway you want. The problem is, to create large robust software we need to work as a team so finding a common vocabulary, conventions, frameworks for working together is vital to building the next big application.

MVC is a way of thinking of the main functional components of a web application. Let's discuss each one in concept and how that translates into your application.

## Model

Model refers to your data. This is the part of your application that creates the interface with your data separated into different data models. They usually manifest as objects in your code that have methods that allow you to manipulate the source of data that is what ORMs and ODMs do.

- ORM - Object Relationship Mapper (For SQL Databases)
- ODM - Object Document Mapper (for Document Databases like Mongo)

So essentially the Model aspect of your application does the following...

- Connects to your database
- Maps your tables (SQL) or collections (noSQL) to objects via ORM/ODM
- Those objects are used throughout your application to fetch and create data

## Views

Views deal with the visual aspect of an application. Essentially templates with placeholders where the data will eventually be. This is generally done in one of two ways.

- Server-Side Rendering: You use a templating library like EJS/ERB, Jinja, Plush, Blade, Pug, Handlebars, and more which renders an HTML/CSS page by injecting the data into the proper spots in the template then sending the finished file to the client's browser.

- Client-Side Rendering: Using a framework like React, Angular, Vue or Svelte a frontend application is sent to the client without the data and the application then pulls the data via API request as needed to fill in the placeholders as needed.

**BONUS** Another growingly popular option is static site generation where instead of rendering the site server-side/client-side when the site is requested, the site is pre-rendered on a regular schedule. Whenever a build is run the data is pulled and the templates are rendered and the end result is hosted statically. Great for data that may not change frequently. Gatsby, NextJS, NuxtJS, Gridsome, Scully, Sapper, JungleJS, Plenti, and Elder.js are all popular static site generators you can find a full list at JAMStack.org.

## Controllers

Controllers are what connects everything together like a traffic controller makes sure everyone is getting what they need. This comes in the form of the routes of your web server and the controller functions that they run to generate a response.

- route: A route is an instruction to a web server about when a specific request comes in, what function should be run. So I may say when people make a GET request to "/cheese" that a function called cheese is run.

- controller function: The function that is run in response to a request where a route has been defined. This function can do literally anything, but two typical flows for retrieving data are such.

1. Sever Side Rendering: The function uses the model object to get the data from the database then runs the templates library render function passing it the data and the template and the output is sent to the client as a response.

2. Client-Side Rendering: The page has already been loaded by the browser so the routes deliver the data to the client-side application as JSON data upon request. So request comes in, data is fetched using model object then serialized into JSON data and sent to the client.

Essentially the controllers are the glue that allows the Models and Views to work together!

## Conclusion

Whether you are using Ruby on Rails, Django, Express, Laravel, Buffalo, or the endless number of web frameworks across all languages, understanding MVC makes switching between them and learning them much easier since they all follow the same principal architecture.