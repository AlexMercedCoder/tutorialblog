---
title: Typescript 101 - Typing, Interfaces and Enums oh MY!
date: "2020-10-02T22:12:03.284Z"
description: Super charging Javascript Scalability
---

**Watch My Typescript Video Playlist Here: https://www.youtube.com/playlist?list=PLY6oTPmKnKbboGAL_-MineM-zcOblOm6V**

## What is Typescript?

Javascript is the language of the web and that's not changing anytime soon, although as projects and teams get bigger it can be hard to prevent or catch bugs cause of Javascript's high level of flexibility.

In other languages typing offers several benefits:

- defining what values variables and parameters should receive or functions should return allow for compile time errors to be discovered before the code is ever run.

- Typing allows the code to be more self-documenting to other developers on the team so they know what should be going into your functions.

- Typing also allow IDE's to monitor code for mistakes and warn you early on when functions are misused.

Typescript is a language created by Microsoft that makes switching from Javascript very easy... cause it is literally just javascript with typing. Typescript requires a compile step and is heavily integrated into Microsofts Visual Studio Code. This gives you two lines of defense from deploying code that breaks at runtime (when the end user is experiencing your code.)

- VS Code can catch error based on your typing
- The TS Compiler (TSC) will not compile unless all type checks successfully pass

The end result is browser compliant Javascript, but you get all the cool latest Javascript features plus bug preventing typing features working in Typescript.

## Let's get started

For this tutorial I'll be working from this CodeSandBox: https://codesandbox.io/s/typescript-starter-u7of1

To create a local typescript setup from scratch you can run the follow commands.

- just typescript: `npx merced-spinup ts projectName`

- Typescript/React: `npx merced-spinup reactts projectname`

Also many frameworks have typescript inherently built into them...

- Frontend: Angular
- Backend: NestJS
- Backend: FoalTS

## Typing Your First Variable

So delete all the current contents of index.ts and open up the codesandbox console, we won't really be using the browser screen so the terminal can take up all the space. Let's make a variable!

```ts
let myFirstVariable: string = "3"
console.log(myFirstVariable)
```

notice the `:string` after the variable name, this is us defining what the variable should contain. Let's try reassigning myFirstVariable:

```ts
myFirstVariable = 3
console.log(myFirstVariable)
```

You'll notice the IDE show a red line error saying number is assignable to type string. Since we are using codesandbox it won't have a compile error, but you'd get the same error if you were compiling locally.

## Typing More Complicated Types

### Arrays

So let's say I have an array, I could type it like so.

```ts
const myArray: [string] = ["Hello", "World"]
console.log(myArray)
```

This tells ts that myArray must be an array of strings, I'll get an error if I try to add a non-string value.

```ts
myArray.push(5)
```

What if I want an array with numbers and strings, we can use the built TS escape hatch, "any".

```ts
const myArray: [any] = ["Hello", "World"]
console.log(myArray)
myArray.push(5)
```

The any type allows anything to be acceptable but then you don't get the compile errors or syntax highlighting errors that may help catch genuine errors.

```ts
const myArray: Array<string | number> = ["Hello", "World"]
console.log(myArray)
myArray.push(5)
```

This syntax allows to say any of the elements of the array can be a string or number.

### Objects

For non-class objects we should create a new interface for typing (for objects made from a class, the class is the type).

```ts
interface Person {
  name: string
  age: number
  email: string
}

const Alex: Person = { name: "Alex Merced", age: 35 }

console.log(Alex)
```

So now the error we get tells us that the email property is missing. What if we want the email property, but we want it to be optional?

```ts
interface Person {
  name: string
  age: number
  email?: string
}

const Alex: Person = { name: "Alex Merced", age: 35 }

console.log(Alex)
```

Adding the question mark allows TS to know that property may exist but that it is not required. Required properties can be very useful for team members using your code, cause TS will warn them if they forgot a property necessary for your code to run correctly, and if a property name has a type it'll complain the right one is missing and that the typo doesn't exist on the type.

### Functions

Here is an example of a typed function...

```ts
const addNums = (x: number, y: number): number => {
  return x + y
}

console.log(addNums(3, 3))
console.log(addNums(3, "3"))
```

So noticed each parameter is typed and the return value typed outside of the parameter parenthesis. You should see an error in the second console.log since we are passing a string as a parameter when a number is required.

## Enum

Enums allow us to define sets of constants. If you don't specify a value it will assign numerical a value in order. This allows use to assign values that may be less intuitive to named constant that are easier to use. Like using a brand name to equal a serial number.

```ts
enum LifeStage {
  baby = 1,
  toddler,
  child,
  teenager,
  adult,
  senior,
}

interface Person {
  name: string
  height: number
  inches: number
  stage: number
}

const Alex: Person = {
  name: "Alex Merced",
  height: 5,
  stage: LifeStage.adult,
  inches: 10,
}

console.log(Alex)
```

Notice we only assigned a value to the first LifeStage, so the others were numbered relative to it, so the log showed stage having a value of 5. If I hadn't numbered the first value stage it would be 4 since it would start numbering them with 0.

## Custom Types

You can also just pre-name your types so you don't have to type them out each time. Here are some examples.

```ts
type yesno = "yes" | "no"
```

This is a type that only accepts yes or no as as string value

```ts
type weirdarray = [string, number, boolean]
```

This a type that only accepts an array with a string, number and a boolean in that order.

```ts
type error = "network error" | "schema error"
type success = "success"
type response = error | success
```

Here we define two types, error which must one of several strings and success which can only be success. Then we make a type that can be either one of these types.

```ts
type response = error | success
interface data {
  data: Object<any>
}
interface res {
  response: response
}
type APIResponse = data & res
```

So for an object to succeed the check for APIResponse it must have data property which is object with any properties and a response property of type response.

## Bottom Line

Typescript doesn't really change Javascript it just allows you to be more explicit so you can have less errors as quicker debugging as your codebase grows and a greater number of people are writing code for it.
