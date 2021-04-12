---
title: Ultimate Guide to Javascript Functions
date: "2021-04-11T12:12:03.284Z"
description: What's your function?
---

Functions are one of the most important concepts in programming, and Javascript gives functions first-class support meaning there is a lot to learn but a lot of great ways to use functions in javascript. This article is a reference on functions in javascript. Enjoy.

## What is Function?

Think of functions like a wizard has spells. Whenever a wizard wants to conjure some creature he looks in his book of spells and casts a spell. Another analogy is a Chef with their book of recipes.

Whether you are a chef or a wizard you must commit write down your spell/recipe before you can use it, this is referred as defining your function.

```js
function wizardSpell (){
    // what the spell does
}
```

The code above is one of three ways we can write down our spell/recipe, also known as defining our function. Once our function is defined we can use it anytime we want like so.

```js
wizardSpell()
```

So to cast our spell, cook our recipe and invoke our function we write the function's name with a parenthesis after it. (If there is no parenthesis then you are not using the function, but just referring to the function itself).

To notice the difference between invoking the function, and the value of the function, try this.

```js
function returnOne(){
    //this function will give you the number one
    return 1
}

// logging the result of invoking the function
console.log("Invoking: ", returnOne())
// logging the value of the function
console.log("Function Value ", returnOne)
```

## Function Declarations

As I mentioned the syntax above was one of two main ways we can define our function. The method above is a function declaration. Just as a refresher...

```js
// defining our function with a function declaration
function someFunction(){

}

// invoking the function we defined
someFunction()
```

Function declarations are hoisted, which means the javascript engine before executing any code will scour your code for all function declarations and read them into memory. This means you can invoke a function in a line prior to its declaration. For example, the following code is confusing, but works.

```js
// invoking that is defined later on
someFunction()

// defining our function with a function declaration
function someFunction(){

}
```

This is certainly more confusing and having all possible functions loaded into the global space can also hamper performance, so most modern Javascript development has moved towards function expressions.

## Function Expressions

Function expressions take advantages that functions have first-class support in javascript, which means they are a value that can be used in any way any other datatypes can be used.

- Functions can be assigned to variables, stored in arrays, or be the value of object properties

- Functions can be passed as an argument to other functions

- Function can be returned by functions

So instead of declaring a function, function expressions define a variable in which a function is stored. Variable declarations are not hoisted so invoking must occur after the definition and avoids the memory pollution of function declarations.

#### Ways to write function expressions

1. Named function stored in a variable

```js
// define the function via function expression
const someFunction = function funcName(){

}

// invoke the function
someFunction()
```

2. Function expression using an anonymous function (has no name) with the function keyword

```js
// define the function via function expression
const someFunction = function(){

}

// invoke the function
someFunction()
```

3. Function expression using an anonymous function (has no name) using arrow functions

```js
// define the function via function expression
const someFunction = () => {

}

// invoke the function
someFunction()
```

#### Parameters & Arguments

Functions become really powerful when you can pass in data to customize what happens each time you invoke a function. Parameters and Arguments allow us to do just this. Parameters allow us to define a placeholder for data that will be passed in when the function is invoked. Arguments are the data that is passed in when the function invoked/called.

```js

// cheese and bread are parameter, acting as a placeholder for data we don't have yet
const someFunction = function(cheese, bread){
  console.log(cheese)
  console.log(bread)
}

// we will pass the string "gouda" as the first argument which gets stored in cheese as the function runs, we also pass "rye" as the second argument which gets stored as bread during the run.
someFunction("gouda", "rye")
```

## Functions Return Values

Think of a function as a task given to a butler. Usually, a task involves the butler getting something and bringing it back. In the function world, this is called a return value. 

The benefit of a return value...
- can be assigned to a variable
- can be used in expressions
- can be passed as arguments to other functions (callbacks)

Try out the below to see the difference

```js
// function that logs instead of returning a value, kind of like a butler showing the bottle of wine you asked for but never bringing it to you.
const noReturn = () => {
  console.log("Hello World")
}

const result1 = noReturn() //no return value, so the variable gets nothing

console.log(result1) // undefined is logged, since the variable has no value

//////////////////////////////////
//////////////////////////////////

// function that returns a value, this is like the wine being brought and placed in your hands
const returnSomething = () => {
  return "Hello World"
}

const result2 = returnSomething() // the variable will hold the return value of "Hello World"

console.log(result2) // this will log "Hello World"
```

## Cool Function Tricks

#### Parameter Default Values

```js
// we assign 4 & 6 as default value to x & y
const someFunction = (x = 4, y = 6) => {
  return x + y
}

console.log(someFunction()) // log 10
console.log(someFunction(2,2)) // log 4
```

#### Variable Number of Arguments

There are two ways of doing this. In a function definition that uses the function keyword, there are magical iterable object arguments you can access, you can then use a for-of loop to loop over it or use the spread operator to turn it into an array.

```js
const someFunction = function(){
  // log the arguments object
  console.log(arguments)
  // loop over the arguments object
  for (arg of arguments){
    console.log(arg)
  }
  // turn it into a proper array
  const argArray = [...arguments] 
}

someFunction(1,2,3,4,5,6,7)
```

The more explicit way that works with all methods of defining function is using the rest operator to capture all remaining arguments in an array.

```js
// function that adds up all the numbers
const someFunction = (x, y, ...args) => {

  // add the first two arguments
  let sum = x + y

  // add in the remaining arguments
  for (num of args){
    sum += num
  }

  return sum

}

console.log(someFunction(1,2,3,4,5,6,7,8))

```

#### Closure

Each function has its own scope and if you define a function inside of a function it has access to the parent functions scope. This can be an interesting way of hiding data, which is particularly key to how React Hooks work. Examine the example below.

```js

const parentFunction = (startingValue) => {
  // creating a variable with an initial value
  const value = startingValue
  // define a function that returns the value
  const getValue = () => { return value }
  // define a function that alters the value
  const setValue = (newValue) => { value = newValue }
  // return both functions in an array
  return [getValue, setValue]
}

// destructure the return value of the parent function
const [getValue, setValue] = parentFunction(1)
console.log(getValue()) // logs 1
setValue(2)
console.log(getValue()) // logs 2
```

In this example, getValue and setValue have access to the parentFunction scope outside of it since they were defined inside of it.

#### Currying

This is breaking up a function that needs multiple arguments into a chain of functions taking advantage of closure.

Let's curry this function.

```js

const addAndMultiply = (x, y, z) => {
  return x + y * z
}

console.log(addAndMultiply(2,3,4)) // 2+3*4=20

```

Given, this example is simple enough it probably doesn't need to be curried but to illustrate how it would work...

```js

const addAndMultiply = (x) => (y) => (z) => {
  return x + y + z
}

//invoking the functions back to back
console.log(addAndMultiply(2)(3)(4)) // 20

// doing it step by step

const add = addAndMultiply(2)
const multiply = add(3)
const result = multiply(4)
console.log(result)//20
```

#### Destructuring Arguments

If you know a function will be passed an object or an array as an argument you can use destructuring.

```js
// For Objects
const myFunction = ({name, age}) => {
  console.log(name)
  console.log(age)
}

myFunction({name: "Alex Merced", age: 35})
```

```js
// For Arrays
const myFunction = ([name, age]) => {
  console.log(name)
  console.log(age)
}

myFunction(["Alex Merced", 35])
```

#### Arrow Function Shorthand

- If there is only one parameter, no parenthesis needed
- If you plan on return the value of a single express, you can exclude the curly brackets the return keyword will be implied
- If the expression is long you can wrap it in parenthesis

```js
const quickFunction = x => x + 1

const longExpression = y => (y + y * y - y * y)
```

## Good Function Design Tips

- Function should not mutate alter variables outside of its scope
- Anything it needs from outside its scope should be passed in as arguments
- If you need to transform data have the function return a copy with the transformed data instead of mutating the original
- If you need lots of arguments use an object, this allows you to give arguments names and also be able to add new arguments without much refactoring
- long complex functions should be broken down into many smaller ones (think currying)
- As you get more comfortable with writing functions, look into memoization, a technique that allows a function to cache previously calculated results to minimize redundant processes.