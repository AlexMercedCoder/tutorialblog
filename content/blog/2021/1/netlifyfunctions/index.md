---
title: How to use Netlify Cloud Functions
date: "2021-01-23T12:12:03.284Z"
description: Your First Cloud Function
---

## Context

[First Read My Article on Cloud Functions to understand why you should learn about them!](https://tuts.alexmercedcoder.dev/2021/1/cloudfunctions/)

## Getting Started

- Create a new folder and initiate a git repo inside of it
- in this folder create two new subfolders, functions and public
- Create an index.html in the public folder (just something for us to deploy)

```html
<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>Document</title>
  </head>
  <body>
    <h1>My Netlify Function Site!</h1>
  </body>
</html>
```

- create a netlify.toml file in the main folder (parent of functions/public)

```toml
# netlify.toml documentation => https://docs.netlify.com/configure-builds/file-based-configuration/#post-processing

#///////////////////////////////
# Application Build Settings
#///////////////////////////////
[build]
    #base = the root folder for build context (where the package.json file is)
    #base = ""

    #publish = after build command is complete the folder to serve as the website
    publish = "public"

    # command = the build command to run from the base directory
    # command = "npm run build"

    #functions = folder where your netlify functions are located
    functions = "functions"


#///////////////////////////////
# URL Redirects
#///////////////////////////////
# Below is a very standard rule for Single Page Apps using routing
#[[redirects]]
#   from = "/*"
#   to = "/index.html"
#   status = 200


#///////////////////////////////
# Headers
#///////////////////////////////
#Below a configuration to let other websites make requests to yours
#[[headers]]
#   for = "/*"
#   [headers.values]
#       Access-Control-Allow-Origin = "*"
#       Access-Control-Allow-Methods = "*"
#       Access-Control-Allow-Headers = "*"

```

_While a lot of the above properties we don't need for this exercise you can use the above template to easily find the other powers of the netlify.toml file_

- in the functions folder create a new folder called "first" and in there an index.js

- in the index.js we can now write our first function!

/functions/first/index.js

```js
//We export the function
exports.handler = async function (event, context) {
  //Fetch request details from event object
  const { path, httpMethod, headers, queryStringParameters, body } = event

  // return some JSON data with a status of 200
  return {
    statusCode: 200,
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      path,
      httpMethod,
      headers,
      queryStringParameters,
      body: body ? JSON.parse(body) : "none",
    }),
  }
}
```

- now commit everything, push up to github and deploy to netlify

- then to use this function the url would be...

```
https://mynetlifyurl/.netlify/functions/first
```

just to see it grab the url query try out

```
https://mynetlifyurl/.netlify/functions/first?cheese=gouda
```

Try using postman or CURL to make other types of requests like POST, PUT, DELETE

## Other Things to Know

- using the httpMethod property you can use if or switch statements to create different tasks based on the request

- you can install other node libraries in the package.json in your base directory and use them in your functions.

- To enable cors just set the headers like so:

```js
headers: {
      "Content-Type": "application/json",
      "Access-Control-Allow-Origin": "*",
      "Access-Control-Allow-Headers": "Content-Type",
      "Access-Control-Allow-Methods": "GET, POST, PUT, DELETE",
    }
```

- If you are getting a cors error despite having the proper cors errors, it may be because the function is erroring
