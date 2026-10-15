---
tags:
  - "express"
  - "javascript"
  - "node"
author: "Alex Merced"
title: "Handling Cross-Origin Cookies with ExpressJS"
date: "2023-08-23T12:12:03.284Z"
category: "javascript"
description: "Send cookies across origins in Express: CORS headers, the cors middleware with credentials, and httpOnly, secure and sameSite settings for dev and production."
---

## What is CORS (Cross Origin Resource Sharing)

This is security feature in web browsers for preventing unwanted cross-origin requests (this doesn't apply to requests outside of a web browser like backend->backend requests or http clients like CURL or postman). A cross origin requests is when the origin of the sender is different than that of the receiver.

Example:
- abc.xyz.com sending a post request to def.xyz.com
- localhost:3000 sending a post request to localhost:5000

In both these situations as far as the browser is concerned these are two completely different applications, and the application receiving the request needs to express that it is ok with receiving the incoming request. This is done in a two step process.

- Browser sends a "pre-flight" request usually of the OPTIONS HTTP method
- The receiver responds to this request with ALLOW headers specifying what is allowed
- If the headers allow the appropriate details, the main request is made and handled. If not, a CORS error is thrown by the browser.

The headers that handle this are:
- Access-Control-Allow-Origin: This details what origins are allowed to send a request
- Access-Control-Allow-Methods: Specifies which methods are allowed
- Access-Control-Allow-Headers: Specifies which headers are allowed
- Access-Control-Max-Age: Max age of the request
- Access-Control-Allow-Credentials: whether cookies can attached to requests

## Handling Cors in Express

In expressJS applications, you can manually set these headers on your own in custom middleware or in each route like so.

```js
  // Allow requests from any origin
  res.setHeader('Access-Control-Allow-Origin', '*');
  
  // Allow specific HTTP methods
  res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE');
  
  // Allow specific headers to be sent in the request
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');
  
  // Allow credentials (e.g., cookies, authentication) to be included in requests
  res.setHeader('Access-Control-Allow-Credentials', true);
```

But like more backend frameworks there are native or 3rd party libraries for doing this in a much easier way. 

[cors](https://www.npmjs.com/package/cors)

The Cors middleware library makes setting all these cors headers as easy as this...

```js
// Use the cors middleware
app.use(cors());
``` 

Much easier and this generally works for most situations but when your dealing with cookies, the security issues are bigger so the level of configuration is greater. So let's discuss what these settings would look like for cross-origin cookies.

## Cookies

Cookies are a string of data you can store on the users computer that can be attached to all subsequent requests to the backend server.

These can be set manually in your response headers, as an example:

```js
res.setHeader('Set-Cookie', 'myCookie=exampleValue; HttpOnly');
```

Although express makes setting cookies easier with `res.cookie`

```js
res.cookie('myCookie', 'exampleValue', { httpOnly: true });
```

This makes for an easier form of defining your cookies and its settings vs using one long string.

## For Local Development

For cross-origin cookies, you have to have specific origins in your cors headers along witht he Allow Credentials header set to true so incoming cookies can be send.

```js
app.use(
    cors({
      origin: "https://xyz.onrender.com",
      credentials: true,
    })
  );
```

For Local Development where you are behind http:// your cookie settings should look like:

```js
      res.cookie("token", token, {
        // can only be accessed by server requests
        httpOnly: true,
        // path = where the cookie is valid
        path: "/",
        // domain = what domain the cookie is valid on
         domain: "localhost",
        // secure = only send cookie over https
        secure: false,
        // sameSite = only send cookie if the request is coming from the same origin
        sameSite: "lax", // "strict" | "lax" | "none" (secure must be true)
        // maxAge = how long the cookie is valid for in milliseconds
        maxAge: 3600000, // 1 hour
      });
```

- domain must be localhost to allow for local apps
- secure must be false
- sameSite's "Strict" setting won't allow cross-origin and "none" only works if secure is true, so "lax" is the best option

once your application is deployed the setting on your cookies should be:

```js
      res.cookie("token", token, {
        // can only be accessed by server requests
        httpOnly: true,
        // path = where the cookie is valid
        path: "/",
        // secure = only send cookie over https
        secure: true,
        // sameSite = only send cookie if the request is coming from the same origin
        sameSite: "none", // "strict" | "lax" | "none" (secure must be true)
        // maxAge = how long the cookie is valid for in milliseconds
        maxAge: 3600000, // 1 hour
      });
```

- we remove the domain setting, it'll figure it out fine
- secure is now true
- sameSite can be "none" to allow for cross-origin requests

Now it can be tedious changing these settings everytime you want to do local development vs deploying to production, let's talk about how we can handle that.

## Environmentally Conditional Code

Often time you may have different versions of code you want to run in different environments, usually you have three possible environments.

- development: you running the code to develop it, so you don't want to use your production database and probably want a lot of logs to diagnose bugs

- test: when the code is being run against tests, sometimes you'll have seperate database and logs for this situation

- production: when the code is deployed and available publically to the world, should be using a production database that holds the actual data of your users instead of the sample data you may have in development and test environments.

You will often signal to your what the environment is using an environmental variable, environment variables can be called anything but typical ones are.

- ENVIRONMENT
- NODE_ENV

For most NodeJS development, NODE_ENV is used to specify the environment which you can use to run code conditionally like so.

```js
// get environment from environment variables
const ENVIRONMENT = process.env.NODE_ENV

// run code conditionally
if(ENVIRONMENT === "development"){
  // code to run 
}
```

For environmental logs to avoid writing a bajillion if statements you can wrap the logic in a function like so.

```js
function devLog(...args){
if(process.env.NODE_ENV === "development")
   console.log(...args)
}

devLog("this log will only run in development")
```

We can use this for CORS logic like so:

cors middleware
```js
if (process.env.NODE_ENV === "development"){
  app.use(
    cors({
      origin: "https://localhost:3000",
      credentials: true,
    })
  );
}

if (process.env.NODE_ENV === "production"){
  app.use(
    cors({
      origin: "https://xyz.onrender.com",
      credentials: true,
    })
  );
}
```

cookie settings
```js
if (process.env.NODE_ENV === "development"){
        res.cookie("token", token, {
        // can only be accessed by server requests
        httpOnly: true,
        // path = where the cookie is valid
        path: "/",
        // domain = what domain the cookie is valid on
         domain: "localhost",
        // secure = only send cookie over https
        secure: false,
        // sameSite = only send cookie if the request is coming from the same origin
        sameSite: "lax", // "strict" | "lax" | "none" (secure must be true)
        // maxAge = how long the cookie is valid for in milliseconds
        maxAge: 3600000, // 1 hour
      });
}

if (process.env.NODE_ENV === "production"){
        res.cookie("token", token, {
        // can only be accessed by server requests
        httpOnly: true,
        // path = where the cookie is valid
        path: "/",
        // secure = only send cookie over https
        secure: true,
        // sameSite = only send cookie if the request is coming from the same origin
        sameSite: "none", // "strict" | "lax" | "none" (secure must be true)
        // maxAge = how long the cookie is valid for in milliseconds
        maxAge: 3600000, // 1 hour
      });
}
```

## Conlclusion

Hope this email helps you understand how to take advantage of cross-origin cookies in your expressJS apps.
