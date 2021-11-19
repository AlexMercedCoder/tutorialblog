---
title: MongoDB Relationships using Mongoose in NodeJS
date: "2021-11-19T12:12:03.284Z"
description: Guide to Relating Data
---
![Title Image](https://i.imgur.com/tleNmhh.jpg)

#### Pre-requisites:
- [Basic Knowledge of Mongo & Mongoose](https://youtube.com/playlist?list=PLY6oTPmKnKbaSCVF-Imd1hkQJvl8iLrV3)
- [Watch This Video on Thinking Through Your Datas Structure](https://youtu.be/-rrVvYs1DkQ)

## Terminology

**Schema**

A description of the shape a unit of data should undertake. So for a house isn't the data, but a description of what the data of a house should look like.

```js

const mongoose = require("mongoose")

const houseSchema = new mongoose.Schema({
    street: String,
    city: String,
    state: String,
    zip: String
})

```

**Schema**

If we want to manage a collection of documents (a bunch of items) of this datatype we then declare a model. This creates a collection and becomes the conduit to add, update, delete and retrieve data from the collection.

```js
const House = mongoose.model("House", houseSchema)

// query for all houses
House.find({})
```

## One to One Relationships

One to One relationships are the simplest. Imagine that every house can only have one owner, and every owner can only own one house. This is a one to one relationship. everything is unique on both sides there really isn't a need for more than one collection. Instead we can nest one type of data in the other.

```js
const mongoose = require("mongoose")

const Owner = new mongoose.Schema({
    name: String
})

const houseSchema = new mongoose.Schema({
    street: String,
    city: String,
    state: String,
    zip: String
    owner: Owner
})

const House = mongoose.model("House", houseSchema)
// Create a new house
House.create({
    street: "100 Maple Street",
    city: "Fort Townville,
    state: "New West Virgota",
    zip: "77777"
    owner: {name: "Alex Merced"}
})

// query for all houses, will include the nested owner info
House.find({})
```

## One to Many

Let's see how we can refactor this to handle a Owner having many Houses, but Houses only having one owner. This is One to Many. So Owners are the "one" side of the relationship, and House is the "many" side. Typically what we do is track the one side from the many side (it's the house data that'll track the owner).

With mongoose we have a special datatype that tells mongoose that the entries in that field are all objects _ids of documents in some other collection. See this at work below.

The populate function when we query the data will make sure mongoose fetches the data from the related table and inserts where needed.

Note: You do also have the option of nesting an arrya of House in the Owner schema, although there is a maximum size for one document that can cause scaling issues later if you try to nest too much data.

```js
const mongoose = require("mongoose")

const ownerSchema = new mongoose.Schema({
    name: String
})

const Owner = mongoose.model("Owner", ownerSchema)

const houseSchema = new mongoose.Schema({
    street: String,
    city: String,
    state: String,
    zip: String
    owner: {type: mongoose.Types.ObjectId, ref: "Owner"}
})

const House = mongoose.model("House", houseSchema)

// Create a Owner
const alex = await Owner.create({name: "Alex Merced"})

// Create a new house
House.create({
    street: "100 Maple Street",
    city: "Fort Townville,
    state: "New West Virgota",
    zip: "77777"
    owner: alex
})

// query for all houses, use populate to include owner info
House.find({}).populate("owner")
```

## Many to Many

In all reality, houses can have many owners and owners can have many owners, so we truly have a many to many relationship. In this situation we create a third collection to track the different matches.

```js
const mongoose = require("mongoose")

const ownerSchema = new mongoose.Schema({
    name: String
})

const Owner = mongoose.model("Owner", ownerSchema)

const houseSchema = new mongoose.Schema({
    street: String,
    city: String,
    state: String,
    zip: String
})

const House = mongoose.model("House", houseSchema)

const houseOwnerSchema = {
    owner: {type: mongoose.Types.ObjectId, ref: "Owner"},
    house: {type: mongoose.Types.ObjectId, ref: "House"}
}

const HouseOwner = mongoose.model("HouseOwner", houseOwnerSchema)

// Create a Owner
const alex = await Owner.create({name: "Alex Merced"})

// Create a new house
const mapleStreet = await House.create({
    street: "100 Maple Street",
    city: "Fort Townville,
    state: "New West Virgota",
    zip: "77777"
    owner: alex
})

// Create record that the owner owns the house
HouseOwner.create({owner: alex, house: mapleStreet})

// QUery for all houses owned by alex
HouseOwner.find({owner: alex}).populate("house")

//Query for all owners of the Maple Street House
HoseOwner.find({house: mapleStreet}).populate("owner")
```

## Conlusion

Hopefully this helps in implementing relationships in your next application.