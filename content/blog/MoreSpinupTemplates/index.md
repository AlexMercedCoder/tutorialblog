---
title: More Merced-Spinup Templates
date: "2020-10-05T22:12:03.284Z"
description: Gulp, Express and React!
---

**To See me list my prior templates go here**: https://tuts.alexmercedcoder.com/mercedspinuptut/

## What's New

Reminder, to spinup any supported template with merced-spinup the command is

`npx merced-spinup templateName projectName`

I've made several updates across all my templates that will make then even more flexible than before.

- For any templates using environmental variables in their scripts I've added the cross-env libraries so the scripts will run fun on windows and not only on mac or linux.

- For Linux and Mac (This may work in Git Bash for Windows) users I've also create a new tool called node-basher that runs different bash based scripts. I've added the Merced-Spinup functionality to it and it also runs npm install and removes the git remote for you making for an even quicker spinup experience. To use node-basher the command is.

`npx node-basher spinup templateName projectName`

## New Templates

Since my last article I've added the following templates

#### expresssocket

This is a template with express and socket.io for making things like chat apps or other apps with real-time updates.

#### plainwebpack and plainrollup

These are just plain vanilla Webpack and rollup setups that you can then customize to your particular use.

#### Commander

This is a template for creating CLI tools, I've also included the Chalk library for color coding terminal output and the files library for being able to create and write files. Already has the shebang needed to be used as a script.

#### basicreact

This is a bare bones React/Webpack setup, great for building up your own React setup or using it to learn and practice React without the Bulk of Create-React-App. This template is also available from its own command.

`npx create-react-basic projectName`

#### reacthtml and vuehtml

These are react a vue templates without a bundler where react and vue are added to the project via a script tag. Great for very basic web pages that don't need a robust setup and for people new to React and Vue who want to practice on a smaller scale.

#### angularjs

Since angularjs (1.8) is apparently going to get LTS support till the end of 2021 I made this html template with AngularJS added via script tag. Why not!

#### jqueryhtml

A jquery boilerplate with the jquery script tags and bootstrap already set to go.

#### mongoexpressreact

This is a pretry robust boilerplate for building an application using express, mongo/mongoose, and Express-React-Views (React based Templating Engine). It has sessions and auth pre-configured and ready to go.

#### reactrollup

This is a React build using Rollup instead of React, that way you have options.

#### nextts

A NextJS basic setup using Typescript.

#### gulp and grunt

Basic setup with the gulp and grunt task runners for you build your project from

#### gruntreact

My best effort to make a React Build environment with Grunt and no webpack or rollup. It's a cumbersome as you have to follow some unfamiliar patterns... but it works...

#### expressmongo and expresspg

Express REST Api templates pre-configured for Mongo(using Mongo) or Postgres(using Knex and Objection) databases

#### reactsasscontext, reactsassbootstrap and reactsassmaterialui

These templates all are React with Sass, Router and Context pre-configured. One has the React-Bootstrap component library pre-install and another has the MaterialUI react component library already installed. reactsasscontent has no component library pre-installed.
