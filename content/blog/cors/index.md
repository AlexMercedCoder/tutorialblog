---
title: Understanding and Solving Cors Errors
date: "2020-10-20T22:12:03.284Z"
description: Allowing Cross-Origin API Requests
---

## Explanation

Watch this video where I explain what CORS errors are and their solution in concept.

<iframe width="560" height="315" src="https://www.youtube.com/embed/fsMKB7PJoFY" frameborder="0" allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture" allowfullscreen></iframe>

## CORS IN EXPRESS

Refer to the code below to address CORS issues in Express, although my express template already has cors configured if you want to use it as your starting place.

```npx merced-spinup expressrest projectName```

```js
// +& CONFIGURING CORS IN EXPRESS 
// +* INSTALL CORS MIDDLEWARE - npm install cors 

// +% CREATE YOUR CORS CONFIG OBJECT 
// +! Whitelist are URLS allowed to make requests to API
const whitelist = ['http://example1.com', 'http://example2.com']
const corsOptions = {
  origin: function (origin, callback) {
    if (whitelist.indexOf(origin) !== -1) {
      callback(null, true)
    } else {
      callback(new Error('Not allowed by CORS'))
    }
  }
}

// +% ADD MIDDLEWARE TO EXPRESS
// +! USE TERNARY OPERATOR TO TOGGLE BETWEEN ALLOWING ALL SOURCES AND WHITELIST
app.use(NODE_ENV === production ? cors(corsOptions) : cors())
```