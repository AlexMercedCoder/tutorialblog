---
title: Full Crud Mongo/Express API in One Line with MongoRester
date: "2020-10-22T22:12:03.284Z"
description: Scaffolding Mongo/Express APIs with ease
---

## Explanation of Mongorester

One of the nicest things about Ruby on Rails is the scaffold command which creates your migrations, models and even your views all in one command making creating a Rail API almost too easy.

I've seen other tools that try to add this level of productivity to express or mongo but often lacked some flexibility. Mongorester is a library I've created to make creating full crud on a Mongoose model almost too easy. Let me explain how it works.

## The How

Essential you pass in your model name, an object with a schema definition and an options config option and returns you mongoose model and an express router instance with all your main crud routes.

## Try it out

install
```npm install mongorester```

```js

const rester = 

// My Schema Definition Object
const noteSchema = {
  title: String,
  body: String
}

//Create Model and Router
const [Note, noteRouter] = rester("Note", noteSchema)

//Add Router to Middleware, you now have full crud on note!
app.use("/note", noteRouter)

```

so after this you'd have...

- GET /note/
- GET /note/:id
- POST /note/
- PUT /note/:id
- DELETE /note/:id

Since you are returned the model and the router you can use them to add any additional routes you with no problem. The config object can allow you to pass in a custom config object for the schema, override any of the routes, and attach an array of middleware function to the router to run prior to the routes.

## In Summary

Mongorester has arrived to make your express/mongo api making days much easier!