---
title: 6 JS Object Types You May Not Have Used
date: "2020-11-30T22:12:03.284Z"
description: Getting Advanced with Javascript
---

**My Javascript Playlist:** https://www.youtube.com/playlist?list=PLY6oTPmKnKbZDZ9cRrRby4Wnr4GIJj5O3

## 1 - Maps

Maps are like objects in the sense is that they manage key/value pairs with a few minor differences.

- It's iterable, so you can use them for for loops
- You have to use get ans set functions to manipulate and use the key/values
- anything can be keys, numbers, functions, objects, etc.

### How to use a Map

```js

const myMap = new Map()

myMap.set("this is a key", "this is a value")
myMap.set(45768, "another value")

console.log(myMap.get("this is a key"))
console.log(myMap.get(45768))

```

## 2 - Set

A set is an ordered list of unique items, the main use of the set type is to remove all the duplicates out of an array. Sets are iterable but you can't access the individual elements like you could in an array. You can take your array make it into a set to remove duplicates then make it an array again to use all the array methods and features.

### Using a set

```js

const myArray = [1,1,2,2,3,3,4,4]

const mySet = new Set(myArray)

console.log(mySet)

const ArrayWithNoDuplicates = [...mySet]

console.log(mySet)
```

## 3 - Symbols

If you ever used Ruby, you may be very familiar with Symbols. Symbols allow to create a unique static value that can be used in different ways in particular to avoid creating multiple string objects in memory, and in javascript as map strings. Not quite as necessary in JS as in Ruby, but still nice when you need an object to use as a map key.

```js

// Creating symbols to use as keys
const user = new Symbol("user")
const password = new Symbol("password")

const myMap1 = new Map()
const myMap2 = new Map()

myMap1.set(user, "Alex")
myMap2.set(user, "Tony")

myMap1.set(password, "password11")
myMap2.set(password, "password22")

[myMap1, myMap2].forEach((person) => {
  console.log(person.get(user))
  console.log(person.get(password))
})

//accessing the string value of a symbol
console.log(user.description)
console.log(user.description)

```

There are several other pre-made symbols which are used as object keys to manipulate how they behave, most famously, Symbol.iterator.

## 4 - Generators

Generators are a way of creating functions that happen in a particular sequence. To use a generator add and * after the function key word.

## Using Generatores

```js

function* myGen() {
  console.log("stuff1")
  yield 1
  console.log("stuff2")
  yield 2
  console.log("stuff3")
  yield 3
}

//Create the Generator Object
const theGen = myGen()

//Each time I run the next function it runs the function up till the next yield statement and returns the yielded value

const values = [theGen.next(),theGen.next(),theGen.next()]

//this array will consist of all the yielded values
console.log(values)

```

## 5 - Reflect

Reflect is an objects that has some useful static methods for working with objects. Here is some of them at work.

### Using Reflect

```js

//an Object
const myObj = {
  cheese: "gouda",
  meat: "beef"
}

//checking if an object has a certain key
if (Reflect.has(myObj, "cheese")){
  console.log("the key, cheese, exists")
}

//getting the objects key as an array
console.log(Reflect.ownKeys(myObj))

//Adding a property to the object
Reflect.set(myObj, "vegetable", "Broccolli")

```

## 6 Proxy

The Proxy type allows you to create a proxy object that refers to another existing objects but can change some of its functionality.

```js 

//An Object Version of Me
const myself = {
  name: "Alex Merced",
  age: 35
}

//An the handler, an object that alter the functionality of myself
const handler = {
  get: function(target, prop, receiver){
    console.log(prop)
    return target[prop]
  }
}

//Assemble the proxy
const myselfProxy = new Proxy(myself, handler)

console.log(myselfProxy.name)

//Notice, it will now log the key before returning, we have altered how the object fetches properties.
```