---
title: Mongoose, Connecting to Mongo via Javascript
date: "2020-09-17T22:12:03.284Z"
description: Documents, Collections and Databases oh my!
---

## What is Mongo and Mongoose?

Mongo is probably one of the most popular Document Databases around. A Document database is one that doesn't store data in tables (spreadsheets) with fields (columns) and records (rows) like a relational database but instead stores the data as plain text JSON like strings.

In a document database your data is stored in collections which are more like an array than a table, and collections have several documents which are more like a javascript object than a record. So essentially to oversimplify it, when a document database has a collection of documents it's the same as an array of objects in javascript, or closely mirrors it.

Mongoose is a javascript library or ODM (Object Document Mapper) that pulls collections and documents from a Mongo database and returns to us a nice array of javascript objects to work with.

## Getting Started

I am going to assume the following...

- You've created a free account at Mongo Atlas (MongoDB.com)
- You've created a connection string to connect to your database (a url used to connect your application to your database)

I'll be using the default local mongo connection string (`mongodb://localhost:27017/mydbname`), just replace it with your connection string in your code. My recommendation is to hide it using environmental variables before pushing any code to github so other people don't use your database sticking you with the bill.

### Setup

- Create a new folder
- Create a new npm project in that folder ```npm init -y```
- Install Mongoose ```npm install mongoose```

### Let's Create connection.js

We may create multiple scripts to work with our database, instead of recreating the connection code each time let's create on connection file where we can export our connection from.

**connection.js**

```js
//Import Mongoose
const mongoose = require("mongoose");
//Set URI
const URI = process.env.MONGODB_URI || "mongodb://localhost:27017/mydbname";
//Store Connection Object
const db = mongoose.connection;
//Config Object to Avoid Deprecation Warnings
const config = { useNewUrlParser: true, useUnifiedTopology: true };

mongoose.connect(URI, config);

//CONNECTION EVENTS
db.on("open", () => {
  console.log(`You are connected to Mongo`);
})
  .on("error", (err) => {
    console.log(err);
  })
  .on("close", () => {
    console.log(`You are no longer connected to Mongo`);
  });

  module.exports = mongoose
  ```

  So in this script we connect and the export the already connected mongoose object to be used in other scripts.

  ### Let's create schema.js

  We need to create an interface with the database, these will be called models. To create a model we need to define the shape of our data with a schema object and specify the collection we are storing the data in the database we are connected to.

  **schema.js**

  ```js
  // Pull Schema and model from mongoose
const {Schema, model} = require("mongoose")

//CREATE DOG SCHEMA
const DogSchema = new Schema({
    name: String,
    age: Number
})

//Create Model Object, specify collection and schema
const Dog = model('dog', DogSchema)

//Export Model
module.exports =  Dog
  ```

### Let's Seed some data with seed.js

Let's see some data, we'll create a script with some data we'll run once to kickstart out data.

```js
//Import the Database Connect
const mongoose = require("./connection")
//Import the model
const Dog = require("./schema")

// Seed Data

const dogs = [
    {name: "Sparky", age: 1},
    {name: "Spot", age: 2},
    {name: "Rover", age: 3},
    {name: "Beethoven", age: 4},
    {name: "Bud", age: 5},
    {name: "Charlie", age: 6},
    {name: "Cuddles", age: 8},
    {name: "Meatball", age: 9},
    {name: "Angel", age: 10},
    
]

//ADD DATA TO DATABASE, CREATE FUNCTION TO USE ASYNC AWAIT

const createData = async () => {
    try{
        const createdDogs = await Dog.create(dogs)
        console.log(createdDogs)
    }catch(err){
        console.log(error)
    }
}

//Invoke Function
createData()
```

If all is successful you should get the following output in your terminal!

```js
[
  { _id: 5f63cf0918eefaadf6696a7a, name: 'Sparky', age: 1, __v: 0 },
  { _id: 5f63cf0918eefaadf6696a7b, name: 'Spot', age: 2, __v: 0 },
  { _id: 5f63cf0918eefaadf6696a7c, name: 'Rover', age: 3, __v: 0 },
  { _id: 5f63cf0918eefaadf6696a7d, name: 'Beethoven', age: 4, __v: 0 },
  { _id: 5f63cf0918eefaadf6696a7e, name: 'Bud', age: 5, __v: 0 },
  { _id: 5f63cf0918eefaadf6696a7f, name: 'Charlie', age: 6, __v: 0 },
  { _id: 5f63cf0918eefaadf6696a80, name: 'Cuddles', age: 8, __v: 0 },
  { _id: 5f63cf0918eefaadf6696a81, name: 'Meatball', age: 9, __v: 0 },
  { _id: 5f63cf0918eefaadf6696a82, name: 'Angel', age: 10, __v: 0 }
]
```

Notice mongo always creates a new _id property for every new entry in the database. Also nice we didn't have to repeat all that connection code cause we imported the connection.

### Let's Query Some Data

Now that we've seeded our data let's create a query.js and code out the following. We'll continue wrapping our mongo actions in async functions to use that nice pretty async/await syntax.

```js
//Import the Database Connect
const mongoose = require("./connection")
//Import the model
const Dog = require("./schema")

// Our Query Function
const query = async () => {
    const results = await Dog.find({}) // Find all dogs
    console.log(results)
}

//Invoke query function
query()
```

This should return you the full list of dogs

```js
// Our Query Function
const query = async () => {
    const results = await Dog.find({age: {$gt: 5}}) // Find all dogs
    console.log(results)
}

//Invoke query function
query()
```

That should return all dogs with an age greater than 5. I think you are probably starting to get the idea of how this works.

## In Conclusion

In this exercise we...

- Configured a Mongo Database Connection (connection.js)
- Created a Mongo Schema and Model (schema.js)
- Seeded some initial data (seed.js)
- ran a few queries (query.js)

I encourage you to read the mongoose documentation to learn all sorts of other cool things you can do with a mongo database.

