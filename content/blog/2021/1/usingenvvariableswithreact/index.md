---
title: Understanding and Using Environment Variables in React
date: "2021-01-16T12:12:03.284Z"
description: Learning How to hide Data
---

## Why do you care?

In your web application, you'll undoubtedly work with sensitive information like API keys, database credentials, etc. This data can fall into the wrong hands and your next month's hosting bill maybe six figures, it happens. There are two easy ways for people to get this data from your web application.

1. **Looking at your code on a public git repository on sites like Github, GitLab, and bitbucket.** If you hardcode database credentials in your files it will be visible to those who have access to your code. This particular problem is fixed with environmental variables which are the topic of this article.

2. **Inspecting your code at runtime. Through the developer tools built into any browser, you can see the code that makes the site your looking at.** Usually any data hidden by environment variables in the frontend will still be visible in the final version read by the browser. Even if you use clever tricks to hide the data in the code (may you hide it all in a JWT token your app decodes at runtime), when you make API calls or database requests the network section of the developer tools will show all the details of those requests exposing keys and credentials. The only solution to this problem is to have all your most sensitive operations run outside of the browser through custom backend servers (Using Frameworks like KOA, Express or Rails) or cloud functions (AWS Lambda, Netlify Functions, Firebase Functions).

In this article, I'll show you how to deal with problem number one using environmental variables in your React code, but bear in mind your plain vanilla React code is all client-side run in the browser code so it'll still expose your data at runtime if a user knows how to use the browser developer tools.

*Note: Using React frameworks like Next and Gatsby that allow for static pre-rendering or server-side rendering can offer some flexibility on what data appears when, but the same principles apply to the portions that run client-side*

## What are environmental variables

There are variables that don't exist in your code but in the shell environment of the computer that is running the code. Unix based operating systems like Mac & Linux use the Bash shell by default, windows based systems use CMD/PowerShell. Every program and piece of software your computer runs is just a process being run from a shell environment in your computer, the graphical interfaces we have grown used to are just abstractions over this reality. 

So the shell environment has a collection of variables it makes available to all processes they run, these are environmental variables. Every programming language has some mechanism for accessing these variables, in Node the mechanism is process.env an object containing all the current environment variables.

So this is a perfect place to store data we don't want explicitly in our code.

## The .env file

A convention that exists is to use a file called .env and to store all the variables you'd like in the environment in there and you add a third party library that will read the file and add those variables to the shell environment when the process begins (there are several in node, but the most popular is dotenv).

Usually, the file looks like this

```
Variable1=cheese
Variable2=gouda
```

One line for each variable, and in the case of node/javascript I can access them like this:

```js

console.log(process.env.Variable1)
console.log(process.env.Variable2)

```

Although .env files aren't the only option. There are many libraries across many languages that use yaml, json, toml and even XML files as well, your choice.

## .gitignore

Regardless of what file you store your environmental variables in, you DO NOT want to have that file pushed up to GitHub. To tell your local git to ignore certain files you create a file called .gitignore in the root of your repository.

An example of a .gitignore file that ignores my node_modules folder and my .env file

```
/node_modules
.env
```

## In React

If you are using create-react-app, it has the built-in ability to use a .env file so you can just create a .env file and add your variables to it. Also, create-react-app gives you .gitignore with the .env listed already so in that case you're ready to go out of the box.

If you are using a React template that doesn't have built-in .env usage all you have to do is this.

1. install dotenv

```npm install dotenv```

2. Add this line to the top of any file that uses environmental variables.

```js
require("dotenv").config()

// OR

import env from "dotenv"
env.config()
```

3. create your .env file

4. add the .env file to a .gitignore file

## How about during deployment

If you are using Netlify or Vercel they both will not receive your .env file since it isn't being pushed up to GitHub. Both services in their settings have places for you to set up any environmental variables you need and they will work just as if you had your .env file, to begin with. These variables hide data up until your site is being built so again will be exposed at runtime.

If you want to fully hide your data but don't want to create a full-blown backend application and then deploy it via Heroku, both Vercel and Netlify have serverless functions as a feature. With Serverless Functions you can create functions that run on-demand to run processes you don't want to run in the browser. You can theoretically build out the entire server-side of your application in these serverless functions if you wanted to (this is also probably the direction the industry is heading, so not a bad skill to learn).

## In Conclusion

- You want to hide your sensitive data in environmental variables using a .env file that isn't pushed to your remote repository so the repository doesn't expose your data.

- Even with environmental variables you can't hide front-end code at runtime, but backend applications and serverless functions offer the ability to escape this problem but do require a bit more work and comfort with backend development.