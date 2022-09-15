---
title: How to use Vercel Cloud Functions
date: "2021-01-23T12:12:03.284Z"
description: Your First Cloud Function
---

## Context

[First Read My Article on Cloud Functions to understand why you should learn about them!](https://tuts.alexmercedcoder.dev/2021/1/cloudfunctions/)

## Getting Started

- Create a new folder and initiate a git repo inside of it
- in this folder create one new subfolder, api
- Create an index.html in the main folder (just something for us to deploy)

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Document</title>
  </head>
  <body>
    <h1>My Vercel Function Site!</h1>
  </body>
</html>
```

- in the api folder create a first.js with the following

```js
// Vercel Functions docs => https://vercel.com/docs/serverless-functions/introduction

module.exports = (req, res) => {
  res.json({
    body: req.body,
    query: req.query,
    cookies: req.cookies,
    hello: "world",
  })
}
```

- now commit everything, push up to github and deploy to vercel

- then to use this function the url would be...

```
https://myvercelurl/api/first
```

just to see it grab the url query try out

```
https://myvercelurl/api/first?cheese=gouda
```

Try using postman or CURL to make other types of requests like POST, PUT, DELETE

## Other Things to Know

- The req and res objects should work as they do in express.js

* To enable cors just set the headers like so:

```js
headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE",
    }
```

- If you are getting a cors error despite having the proper cors errors, it may be because the function is erroring
