---
title: Spin-up your next project with merced-spinup
date: "2020-09-19T22:12:03.284Z"
description: Templates for days
---

## What is merced-spinup

This all began with my exploring the world of web components and me creating several front end libraries to work with web components (MercedUI, AMPonent, funComponent, etc.). After releasing these, the more I came to realize that just being downloadable on NPM isn't going to be enough to get people to consider them or try them out. One of the things that helps get people going in the major frameworks are CLI tools that can help spinup or bootstrap basic project structures (Vue/Angular CLI or Create-React-App).

So I used WebPack to create build setups for each of my front-end frameworks and along with each template I created a CLI tool (create-mercedui-app, create-amponent-app), you get the idea. While this was a lot of fun and quite a 7knowledge building journey, I started thinking why not build all of this into one tool.

So I created merced-spinup which allows you to spin up a project from one of several templates. First it started with my libraries but then I also included templates for several other libraries, custom templates made and maintained by myself.

So in this article I'll discuss how to use this tool and all the current templates, more constantly being added.

## The basics

Regardless of the template the format of the command and getting started is always the same.

`npx merced-spinup <template> <projectname>`

**template**: keyword for the template you want created

**projectName**: The name of the folder you want the project cloned to.

After running the command a folder will be created, now you can go into this folder and run `npm install` and you are off to the races.

Each template should have a read me with any other pertinent details and I often attempted to put lots of comments in the files to further elaborate on the workflow.

\*If you type an incorrect template name an error message will appear listing all existing templates in case you needed to take a quick look.

## Frontend Templates

### My Libraries

These are the templates for my libraries most built around web components and have a very react-ish or vue-ish workflow. All these templates use webpack and have two commands.

`npm run dev` run dev server

`npm run build` build to a "dist" folder

#### Web Component Based

- mercedui
- amponent
- componentzoo
- superfunc
- funcomponent
- basicelement

#### Custom, non-component based front-end libraries

- mblocks
- renderblocks

### The Mainstream Frontend Libraries

- **vue** => Spin up a Vue template with Vue Router and the Buefy (Bulma for Vue) component library configured
- **angular** => Spins up an angular template with angular router ready to go with some helper components
- **svelte** => Spins up a Svelte template with some starter components
- **jquerywebpack** => That's right, jQuery and Lodash with webpack... have fun.

#### React

- **react** => Spins up a react template using parcel as the bundler
- **reactwebp** => Spins up a react template using webpack as bundler
- **reactrouter** => Spins up a react router configured template
- **reactredux** => Spins up a react template that has redux setup for global state mgmt
- **reactreducer** => Spins up a react template that uses useReducer for global statemanagement in a very redux like setup
- **reactts** => Spins up a typescript react

### Other

- **kofu** A library that combines things like JSX with Observables and more, created by my colleague at General Assembly, Arthur Bernier. This is the only template I don't maintain as I chose to instead make this clone his official template that he is often updating so you always have the latest kofu setup if you want to try it before globally installing the kofu CLI tools for the full KofuJS experience.

- **basichtml** This is a template with no bundler, just an index.html, style.js and app.js ready to go. Bootstrap and jQuery script/link tags ready to go, just need to be commented out. Great for just building a plain web page.

## Backend templates

Not only do I have several frontend templates but also several backend templates for quicky spinning up a server with common middleware pre-installed and conventional folder structures.

### Express

All express builds should have morgan, static serving, and bodyparsing pre-configured. Cors is also configured in templates for Restful apis

- **expressreact** => An express build using express-react-views as the template engine
- **expressejs** => An express build using EJS as the template engine.
- **expressrest** => An express build for create an API, includes CORS configurations

## Other

These templates use many of the other popular NodeJS minimalist web server frameworks. They all should be setup for building a RESTful api so have CORS, bodyparsing and logging configured out of the box.

- **fastify**
- **koa**
- **polka**
- **merver** => This is actually a minimalist web server framework I created, try it out
- **apollo** => Build a graphql API with ease with this template getting all the boilerplate setup out of the way and exposing many of apollos configurations for easy customization

## Other

- **ts** => a basic typescript setup so you can begin writing and typescript in a few seconds. Out of the box configured to compile the index.ts file in the root and and send the output to a folder called compiled. The start command will compile and then run the compiled program for you. Great template for typescript practice to build up a typescript project from.
