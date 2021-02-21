---
title: Many Useful Javascript Tricks
date: "2021-02-21T12:12:03.284Z"
description: Upping Your Javascript Gains
---

**Learn more Javascript with my Javascript Video Playlist => [Javascript Playlist](https://www.youtube.com/playlist?list=PLY6oTPmKnKbZDZ9cRrRby4Wnr4GIJj5O3)**

## Copying Arrays and Objects

One thing that you always have to be careful in programming is that collections (Arrays, Objects, Maps, Sets, etc.) aren't primitive values so variables that hold them don't hold the data but a reference to where the data is located in memory. This creates a syntactical annoyance.

```js
const myArray = [1, 2, 3, 4]
// This line doesn't duplicate the array but creates another variable referring to the same array
const myArray2 = myArray
```

The reason this is an issue is cause it means modifying the myArray2 modifies the same array in myArray. This also translates to function arguments, where modifying an array or object passed in as an argument to a JS function modifies the original. The solution is to use the spread operator.

```js
const myArray = [1, 2, 3, 4]
// This creates an actual copy of the array
const myArray2 = [...myArray]

const myObject = { name: "Alex Merced" }
// This creates an actual copy
const myObject2 = { ...myObject }
```

## Destructuring

If you wanted to assign array elements and object properties to separate variables it can be quite tedious.

```js
const myArray = [1, 2, 3, 4, 5]
const One = myArray[0]
const Two = myArray[1]

const mySelf = {
  name: "Alex Merced",
  age: 35,
}
const name = mySelf.name
const age = mySelf.age
```

To make this easier we can use destructuring syntax.

```js
const myArray = [1, 2, 3, 4, 5]
const [One, Two, Three, Four, Five] = myArray

const mySelf = {
  name: "Alex Merced",
  age: 35,
}
const { name, age } = mySelf
```

Destructuring has a lot of other cool aspects to it...

#### Using the Rest Operator

What if you want a remainder to be added to a separate object or array, the rest operator has got your back.

```js
const myArray = [1,2,3,4,5]
const [One, Two, ...theRest] = myArray

console.log(One, Two, theRest)

const mySelf = {
    name: "Alex Merced",
    age: 35
    email: "Alex@AlexMerced.dev"
}
const {name, ...theRest2} = mySelf

console.log(name, theRest2)
```

#### Skipping Array Values

If you want to skip particular array values, that's an option too.

```js
const myArray = [1, 2, 3, 4, 5]
const [One, , ...theRest] = myArray

console.log(One, Two, theRest)
```

#### Default Values

You can set default values in case an element or property doesn't exist.

```js
const myArray = [1, 2, 3, 4, 5]
// Six has a default value
const [One, Two, Three, Four, Five, Six = 6] = myArray

const mySelf = {
  name: "Alex Merced",
  age: 35,
}
// email has a default value
const { name, age, email = "alex@alexmerced.dev" } = mySelf
```

#### Renaming Properties

To avoid variable name collisions, you can rename properties you destructure from objects.

```js
const mySelf = {
  name: "Alex Merced",
  age: 35,
}
// We rename the name and age fields
const { name: alex_name, age: alex_age } = mySelf
```

#### Destructuring Functions Arguments

You can use destructuring when defining your function parameters.

```js
const add = ({ first, second }) => {
  return first + second
}

//result would be 11
console.log(add({ first: 5, second: 6 }))
```

## Removing Duplicates from an Array

Using the Set Object removing duplicate primitives from an array is pretty easy.

```js
const arrayWithDupes = [
  1,
  2,
  2,
  2,
  2,
  3,
  3,
  3,
  3,
  4,
  4,
  4,
  4,
  4,
  4,
  5,
  5,
  5,
  5,
  5,
]
const withoutDupes = [...new Set(arrayWithDupes)]
console.log(withoutDupes)
```

## Optional Chaining

When accessing object properties we can make the old torture of the "cannot access property of undefined" error go away by using nullish chaining, which checks if the property exists before drilling to the next level.

```js
const mySelf = {
  name: "Alex Merced",
  age: 35,
}

// will just log undefined instead of throwing an error
console.log(mySelf?.friends?.bob)
```

## Nullish Coalescence

While you can use || to set default values, things like 0 and "" will trigger the default value. The Nullish Coalescence operator will allow you to set a default value only if the underlying value is undefined or null.

```js
const num = 0

// Will Assign 5
const oldWay = num || 5

// Will Assign 0
const newWay = num ?? 5
```

## Mixins for OOP Composition

One way to achieve Object composition is by using functions that return a class with the additional methods and properties you may need. Check out the following example. Using this approach you can this of your classes in terms of features and assemble them like a build-a-bear doll.

```js
class Wizard {
  constructor(name) {
    this.name = name
  }
}

// Adds fire abilities to class
const FireAbilities = base => {
  return class extends base {
    fire() {
      console.log("Fire Powers")
    }
  }
}

//Adds fire abilities to class
const WaterAbilities = base => {
  return class extends base {
    water() {
      console.log("Water Powers")
    }
  }
}

const FireWaterWizard = FireAbilities(WaterAbilities(Wizard))
const Merlin = new FireWaterWizard("Merlin")
console.log(Merlin)
Merlin.fire()
Merlin.water()
```

## Closures

A function can take advantage of its local scope and return functions that have access to it. This is fundamental to how React Hooks work, check out this example.

```js
// Creates a variable that can only be changed by the returned functions
const createEnclosedVariable = initial => {
  let theValue = initial

  const get = () => theValue

  const set = newVal => (theValue = newVal)

  return [get, set]
}

// Create a variable using this function

const [get, set] = createEnclosedVariable(1)

console.log(get())
set(2)
console.log(get())
set(3)
console.log(get())
```

## Combining Objects and Arrays

Using the spread operator we can mash together arrays and objects with ease.

```js
const one = [1, 2, 3, 4]
const two = [5, 6, 7, 8]
const mixed = [...one, ...two]
console.log(mixed)

const name = { name: "Alex Merced" }
const age = { age: 35 }
const Alex = { ...name, ...age }
console.log(Alex)
```

## Removing Properties from an Object

Using the spread operator and destructuring we can remove items from an object with ease.

```js
const Alex = {
  name: "Alex Merced",
  age: 35,
  email: "cheese@alexmerced.com",
}
//we remove the wrong email like so
const { email, ...fixedAlex } = Alex
console.log(Alex)
```

## Coloring Your Console.log

#### Browser Based Console.logs

Use %c to specify that you want to apply css to string.

```js
console.log("%c Hello", "color: blue")
```

Inside of a color.js copy this. You could also just use the chalk npm library.

```js
module.exports = {
  Reset: "\x1b[0m",
  Bright: "\x1b[1m",
  Dim: "\x1b[2m",
  Underscore: "\x1b[4m",
  Blink: "\x1b[5m",
  Reverse: "\x1b[7m",
  Hidden: "\x1b[8m",

  FgBlack: "\x1b[30m",
  FgRed: "\x1b[31m",
  FgGreen: "\x1b[32m",
  FgYellow: "\x1b[33m",
  FgBlue: "\x1b[34m",
  FgMagenta: "\x1b[35m",
  FgCyan: "\x1b[36m",
  FgWhite: "\x1b[37m",

  BgBlack: "\x1b[40m",
  BgRed: "\x1b[41m",
  BgGreen: "\x1b[42m",
  BgYellow: "\x1b[43m",
  BgBlue: "\x1b[44m",
  BgMagenta: "\x1b[45m",
  BgCyan: "\x1b[46m",
  BgWhite: "\x1b[47m",
}
```

You can use it in other files like this.

```js
const colors = require("./color.js")

console.log(colors.FgYellow + "Hello")
```