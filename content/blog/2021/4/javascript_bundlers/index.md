---
title: The Wonderful World of Javascript Bundlers
date: "2021-04-19T12:12:03.284Z"
description: Yay! Javascript Build Tools.
---

## Problem #1 - Too Many Script Tags

Originally, frontend Javascript did not have a module system so every Javascript file you use had to be included with a script tag, and they had to be in the right order... this was tedious. So developers figured keeping all your code in one file with one script tag to be the simplest thing to do but the files became massive and hard to work with.

## Solution #1 - Bundlers

The solution was Javascript Bundlers like Browserify that would take several javascript files and "bundle" them into one file that you can include with a script tag.

## Problem #2 - More Complex Build Process

As build processes became more complex it wasn't a matter of bundling but often taking your code through several build steps.

- look to make sure all javascript code is correct with preferred grammar constraints using ESLint
- transpile bleeding edge javascript to browser compatible javascript with Babel, or translate Typescript code to Javascript using the Typescript compiler
- translate any styles written in Sass into CSS
- bundle your code into a single frontend javascript file with browserify
- minify the code to optimize bundle size

## Solution 2.0 - Task Runner

The original solution were Task Runners like Gulp and Grunt with which you could schedule an order of tasks to run these processes. This was fine but then something else came along...

## Solution 2.5 - Webpack

Webpack was a bundler that can also be used to manage your whole build pipeline (run tasks). So you can specify code to be bundled, through plugins and modules create a whole chain of things to be done (lint, transpile, compile CSS and then bundle for example). Webpack made setting this all up much easier from one place with a rich ecosystem of plugins and is still dominant today.

Although, all problems weren't fixed so the demand for other bundlers still existed.

## Problem #3 - Bundle Size

Some of the most popular libraries in all of Javascript are lodash and jQuery which provide all sorts of useful utilities. Although, both of these are very large libraries, and even if you include them just to use one function you end up including the entire library in your bundle which affects performance.

## Solution #3 - Tree Shaking

A new bundler called Rollup hit the scene with a cool new feature called "Tree Shaking". Tree Shaking allowed you to only bundle what you used. So if you only used one Lodash function then only that function would be included in your bundle, not the whole library.

This feature is now standard in bundlers, but Rollup was the innovator in solving this problem.

## Problem #4 - Configuring Webpack and Rollup is Exhausting

Setting up all the configurations for Webpack and Rollup only really needs to be done once but can be time-consuming and complicated to get just right.

## Solution #4 - Parcel

Parcel billed itself as a "no config" bundler. By building into itself many of the most common defaults it created a tool to very easily create your build environment. Of course, the catch is if the defaults aren't what you need then oftentimes going back to Webpack or Rollup may be the right option.

## Problem #5 - Modules are a Thing, and Build times are slow

When running your development environment, bundlers like Rollup, Webpack, and Parcel are rebuilding your entire project after each saves. This is fine in the early stages but as your project gets bigger this re-bundling of your app can start taking a whole lot of time.

Even though Javascript did eventually introduce a frontend module system, people would still bundle their code for compatibility with older browsers.

## Solution #5 - Snowpack and Vite

Newer browsers market share has been going and internet explorer usage has finally died down enough that we can consider using ES Modules for real! On top of that newer browsers have new features to allow differential loaded so you can load one javascript file for newer browsers and another for older ones. (look up the nomodule keyword).

So the newest bundlers around, Snowpack and Vite, take advantage of this. Instead of bundling your whole app into one file, it compiles them into individual modules. Now when your code updates instead of having to rebuild the whole bundle it only needs to rebuild the edited module making for a much faster and pleasant development experience.

Hopefully, you enjoyed this trip down history lane to understand the evolution of Javascript bundlers!