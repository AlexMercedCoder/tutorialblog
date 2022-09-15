---
title: Pattern Matching in Javascript with alexmerced-patternmatcher
date: "2021-09-06T12:12:03.284Z"
description: Like a Switch Statement on Steroids
---

## Conditionals in Javscript

In javascript you generally have on of two choices to test several conditions with different outcomes:

#### If Statements

For example if I want to test whether a variable has one of many strings as its value...

```js
if (color === "red") {
  console.log("it's red")
}

if (color === "blue") {
  console.log("it's blue")
}

if (color === "red") {
  console.log("it's red")
}
```

This can be simplified with one line ifs...

```js
if (color === "red") console.log("it's red")

if (color === "blue") console.log("it's blue")

if (color === "green") console.log("it's green")
```

or ternary operators

```js
color === "red" ? console.log("it's red") : null

color === "blue" ? console.log("it's blue") : null

color === "green" ? console.log("it's green") : null
```

These are more succinct but if the actions that need to be taken if true get complex, then your back to the original more verbose if statements which can terse.

#### Switch Statements

If all we care about is asking whether value a is equal to values b, c, c then switch statements may the happy alternative.

```js
switch (color) {
  case "red":
    console.log("it's red")
    break

  case "blue":
    console.log("it's blue")
    break

  case "green":
    console.log("it's green")
    break

  default:
    console.log("none of them")
}
```

This can be nice and more clear for situations like this. Another cool variation of this is to use a javascript object along with the dynamic keys to treat an object of functions as a switch.

```js
const objectSwitch = {
  red: () => console.log("it's red"),
  blue: () => console.log("it's blue"),
  green: () => console.log("it's green"),
}

objectSwitch[color]() // <--- invoke the function behind which ever string in stored in color
```

This works great and has been a great solution for me but of course you run the risk on a key not present being in color and attempting to invoke undefined which will throw an error, so be careful.

The above are fine but only work if there is a match of values, not useful for more complex lists of conditionals.

#### A Trick for Regex

One trick exists to using a switch with regex by usings it's test methods a true switch.

```js
switch (true) {
  case /red/.test(color):
    console.log("it's red")
    break

  case /blue/.test(color):
    console.log("it's blue")
    break

  case /color/.test(color):
    console.log("it's green")
    break

  default:
    console.log("none of them")
}
```

This works for regex but what if you also want to check variable types, whether a key exist in an object, or the number of elements in a array, then just a big slew of ifs are your only choice.

## Pattern Matching

Structure Pattern Matching is a feature that already exists in languages like Ocaml, reScript, Haskell, Rust and is coming to Python 3.10 in October 2021. In Javascript, this feature is a long way from being a main feature with currently a proposal in [stage 1](https://github.com/tc39/proposal-pattern-matching) meaning we are still several years from it becoming part of the standard.

So I decided to make my own Patter Matching library you can use... now.

`npm install alexmerced-patternmatcher`

## How it works

There are four functions in this library:

`const {createMatcher, createSingleMatcher, matchArray, matchObject} = require("alexmerced-patternmatcher")`

- create a matcher with createMatcher (allows multiple matches) or createSingleMatcher (allow for a single match), which returns a function who test the registered patterns against the value passed to it. createMatcher and createSingleMatcher take two arguments...

- An arrays of arrays, each subarray made of up two elements, an expression in the string where v is the value being matched against, the second element is a function to run if the expression matces receives the value as an argument.

- The second argument is an object of external values you want to use in expressions like classes for typechecking or other variables. These can be accessing by the string express under the namespace "ex".

```js
const matcher = createMatcher([
  ["v === 'red'", v => console.log("it's red")],
  ["v === 'blue'", v => console.log("it's blue")],
  ["v === 'green'", v => console.log("it's green")],
])

matcher(color)
```

I can now use this functions wherever I like, so great for generating a matcher that may be used in multiple places in your app. With the matchArray function we can easily match this against an array of colors. It takes the array as the first argument and the matcher functions to use on the elements.

```js
matchArray(["red", "green", "blue"], matcher)
```

Another great aspect of this is all these functions return you any return values the callbacks return.

## Advanced Usage of patternmatcher

Let's say we want to check the type of an object among custom types we created, it can be done in two ways.

- Without using the externals argument

```js
/// CUSTOM TYPES CAT AND DOG
class Cat {
  constructor(name, age) {
    this.age, this.name
  }
}

class Dog {
  constructor(name, age) {
    this.age, this.age
  }
}

// AN ARRAY OF ANIMALS OF DIFFERENT TYPES
const animals = [
  new Cat("Scratchy", 5),
  new Dog("Spunky", 3),
  new Cat("Paws", 3),
  new Dog("Old Yeller", 10),
]

// LOOPING OVER ARRAY AND DOING DIFFERENT OPERATIONS BASED ON TYPE
const matcher = createMatcher([
  ["v.constructor.name === 'Dog'", v => console.log("It's a dog")],
  ["v.constructor.name === 'Cat", v => console.log("it's a cat")],
])

matchArray(animals, matcher)
```

- version using the externals argument

```js
const matcher = createMatcher(
  [
    ["v instanceof ex.Dog", v => console.log("It's a dog")],
    ["v instanceof ex.Cat", v => console.log("it's a cat")],
  ],
  { Cat, Dog }
)

matchArray(animals, matcher)
```

As you can see the object passed in as the second argument becomes available through the ex namespace, this is important cause otherwise expressions cannot refer to external values like custom classes or variables.

#### Using PatternMatcher on an Object

Let's say you have objects that represent users and you wanted to clean up the data (fix emails, phone numbers). The matchObject function loops over an objects properties as entries and passes them to your matcher which would be receiving an array of `[key, value]`. So you can do stuff like this.

```js
const alex = {
  name: "Alex Merced",
  age: 36,
  email: "alex@alexmercedcoder.dev",
}

const matcher = createMatcher([
  ["v[0] === 'name'", ([key, value]) => console.log("do stuff with the name")],
  ["v[0] === 'age'", ([key, value]) => console.log("do stuff with the age")],
  [
    "v[0] === 'email'",
    ([key, value]) => console.log("do stuff with the email"),
  ],
])

matchObject(alex, matcher)
```

So if you have an array of users you need to perform operations on it would be as easy...

```js
users.forEach(u => matchObject(u, matcher)) // <- run matcher on all users
```

## Conclusion

alexmerced-patternmatcher aims to be a flexible library to create a way to peform operations in response to a diverse set of conditions in syntactically clear and pliable way. Would love to hear your thoughts!
