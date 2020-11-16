---
title: Konjection - ORM Helper using Knex and Objection
date: "2020-11-16T22:12:03.284Z"
description: Connect and Setup Your Models with Ease
---

**Konjection Tutorial Video:** https://youtu.be/zfp7D_MB9c0

## What is Konjection?

Konjection is a helper Library built on top of Knex Query Builder and Objection, so you still have access to the entire API of both these libraries with some time saving helper functions.

**Knex Query Builder:** A library for using functions to structure queries to your SQL Database

**Objection:** An ORM built on top of Knex

## Setup

- Create a new folder for your project

- ```touch db.js```

- ```npm init -y```

- ```npm install konjection```

## DB Connection

In db.js do the following, if using postgres you don't need to install the pg drivers but if using any other database download the drivers and refer to the Knex documentation on how the config object should look like for the knex property.

```js
const konject = require("konjection");

const dbconfig = {
  knex: {
    client: "pg",
    connection: {
      host: "localhost",
      port: "5432",
      user: "test5",
      password: "test5",
      database: "test5",
    },
  },
};

const [knex, Model, konModel, maker] = konject(dbconfig);

module.exports = {
  knex,
  Model,
  konModel,
  maker
};
```

What was exported...

- knex => This is the knex database object that can be used as explain in the knex documentation

- Model => The Objection Model Class that can be used as explained in the Objection documentation

- konModel => function that spins up a new model with basic crud functions

- maker => a wrapper on the knex object to make creating, altering and deleting tables easier, refer to the konjection documentation on how it works. Although if you setup the Knex migrations feature that is probably the ideal way to alter your database.

## Creating a Model

*assuming you've created the proper tables with the proper fields using the knex migrations feature or the maker function*

- create new files... owners.js and pets.js

pets.js

```js
const {konModel} = require("./db.js")

const Pets = konModel("pets")

module.exports = Pets
```

owners.js

```js
const {konModel} = require("./db.js")

const Owners = konModel("owners", {
    relationships: () => {
        const pets = require("./pets")
        return {
            pets: {
                from: "owners.pet_id",
                to: "pets.id",
                model: pets

            }
        }
    }
})

module.exports = Owners

```

**Now you can export these objects and use them as you like through out your application. the konModel function version of the model adds the following functions beyond the functions that would already exist from objection.**

### Model.all
Returns all records for a model

```js
console.log(await Owners.all())
console.log(await Pets.all())
```

### Model.one
Returns a single record based on id

```js
console.log(await Owners.one(1))
console.log(await Pets.one(1)
```

### Model.one
Returns a single record based on id

```js
console.log(await Owners.one(1))
console.log(await Pets.one(1))
```

### Model.create
Creates a Single Record

```js
console.log(await Owners.create({name: "Bob", age: 55}))
console.log(await Pets.create({name: "Spot", age: 5}))
```

### Model.update
Updates a Single Record

```js
console.log(await Owners.update(1, {name: "Bob II", age: 55}))
console.log(await Pets.update(1, {name: "Spot II", age: 5}))
```

### Model.destroy
Updates a Single Record

```js
console.log(await Owners.destroy(1))
console.log(await Pets.destroy(1))
```

**Plus some relation related functions**

### Model.relate
Relates one record to another based on a configured relationship, first takes the id of the model then the of the related item, and last the string to identify the relationship that was setup when the model was created.

```js
console.log(await Owners.relate(1,1,'pets'))
```

### Model.related
Returns the data of the related items

```js
console.log(await Owners.related(1,'pets'))
```

## Bottom Line

Konjection makes making the initial database connection along with some basic methods for your models. Otherwise you still have access to all the power of the knex and objection libraries.