---
title: Deep Dive on Javascript Tooling (Bundlers, Linters, Oh MY!)
date: "2021-01-08T12:12:03.284Z"
description: Node, ESLint, Babel, Bundlers
---

## Node

Once upon a time, Javascript could only run in one place, the Browser. Which means Javascript was limited to your frontend code and your backend server and logic was built in other languages like Java, PHP, Perl, Ruby.

With the creation of NodeJS, the shackles were removed on Javascript allowing it to have its own runtime to be a full-fledged scripting language like Ruby or Python. Node opened the door to several possibilities:

- Creating scripts to automate tasks on your computer
- Access to manipulating files
- Creating HTTP servers
- Creating Tools to make use of Javascript in desktop applications (Electron) and Mobile Applications (React Native, Nativescript)
- Creating tools for more robust development environments for frontend code with Bundlers

Bottom line, Node really released the floodgates on the role Javascript can play as a language.

**NOTE** A New Javascript Runtime was released in 2020 called Deno which is from the same creators of Node built with rust with many cool new features like built-in typescript support, top-level await, and the built in ability to compile your code into executables.

## Babel

The Javascript/ECMAScript specification evolves sometimes faster than most browsers can implement changes, so using the latest Javascript syntax can be a problem. Babel came in and solved that problem by allowing you to write cutting edge Javascript with all the latest features with the ability to transpile the code into older versions of javascript for browser compatibility.

Babel has a plug-in architecture that allows you to add special features like transpiling JSX in react or other custom syntax. It has certainly made maintaining browser compliant code much easier.

## ESLint

A linter is like a spellcheck for syntax. ESLint is specifically a linter for Javascript that also has a plug-in architecture to allow you to customize it to enforce the conventions you want to be enforced in your code, treat warnings as errors, etc.

## CSS Pre-Processors

Sass/SCSS, Stylus, and LESS are different CSS processors. What they do is let you write your styling using a different sometimes more robust syntax which is then compiled into standard CSS. Before there was CSS custom-properties, people would use Sass for variables, functions, mix-ins, and other really helpful features in making more CSS faster.

## Typescript

One of the problems with dynamically typed languages is tooling is less helpful in catching errors since the IDE and other tools have no idea what you intend to store in your variables or what your functions should return. REASONScript is a language that still exists that tried to solve this by making a hybrid language between Ocaml and Javascript called ReasonScript, Microsoft came up with a different solution.

Instead of having a developer learn a lot of new syntax to get up and running they just extended the Javascript language itself, enter Typescript. Microsoft created a superset of javascript, essentially keeping the same cutting edge Javascript syntax we are used to it but adding features for explicit typing to help more easily catch errors as codebases grow larger and larger.

Typescript is then transpiled to standard javascript.

## Prettier

Prettier is a code formatter. Prettier can be used in your IDE, as a separate process or in your build process. Many believe it is best to have it as part of your build step or CI/CD pipeline so the developer doesn't get lazy in writing well-formatted code but still ensures code pushed to the team's repository is formatted based on team conventions. Many just use prettier as an IDE extension and allow it to format their code on save, making sure all the indentation and syntax is looking alright and organized.

## Bundlers and TaskRunners

The only way before ES6 modules to include javascript in your web application was with script tags. The problem is if you use many files getting all the script tags in the right order could get a little complicated as code becomes more complex. Bundlers were designed to let you write your frontend code using ES6 module syntax (import, export, export default) and then have it compiled into one javascript file to be included with a script tag. Browserify was one of the oldest bundlers.

During these times having your code run through all these tools could get really tedious, so Task Runners like Gulp and Grunt came into existence that allowed you to create a chain of tasks to run. So with a command, we can set it to run ESLint, compile our Sass, transpile with Babel, then bundle with Browserify.

Webpack came and changed all of it, a bundler with a plug-in architecture so you can configure all your build steps into webpack instead of using a separate task runner. Just install webpack plug-ins for babel, typescript, prettier, eslint, etc. so when you trigger webpack to bundle your code it executes your desired workflow.

Rollup entered the bundler world with the innovation of treeshaking. Treeshaking allows the bundler to monitor your dependencies for unused code so if you only use one or two lodash or jQuery functions you don't have to bundle the whole library allowing for much more optimized bundles. The creators of Roll-Up also created the Frontend framework, Svelte.

Configuring Rollup or Webpack can be a painful process so Parcel was created which is a no config bundler, it just works. It detects config files for babel or typescript and immediately knows what to do. (For most common uses, Webpack and Rollup are still the way to go for more granular control).

Browser compatibility with ES6 modules has finally hit a critical mass that it may be more practical to begin using them instead of pretending to use them as currently done with modern bundlers. Snowpack, the newest player in the bundler space doesn't really bundle your code but still runs all the main processes but allows your code to be separate modules. The benefit of this is as your code gets larger the speed of the development server stays fast cause it isn't rebuilding your entire app with every save, just the modules that have changed. Snowpack shows a lot of promise for the future of more productive development environments.

## Bottom Line

While typically a lot of tooling is already configured for you in the project generators for all the major frameworks, knowing what the role of these tools are can certainly make it easier to navigate errors and the sea of config files in your projects to diagnose a problem and begin to fix it.
