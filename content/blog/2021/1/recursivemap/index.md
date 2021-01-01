---
title: Javascript - Writing Map as a Recursive Function
date: "2021-01-01T12:12:03.284Z"
description: Thinking Recursively
---

## The Map Function

The map function is probably one of the most important array methods in Javascript, especially if you find yourself often writing React code. What Map does is take a function which it runs on each item in the array and returns a new array of the return value of each run of the function.

```js

const myArray = [1,2,3,4,5]

const newArray = myArray.map(arrayItem => arrayItem + 1)

console.log(newArray) // [2,3,4,5,6]

```

So here we use the map method to return create a new array. We pass a function that returns the current item from the array + 1, resulting in a new array in which all the values are incremented by one.

How does this work? Let's try to rewrite the map function as a standalone function.

```js

const map = (arr, callback) => {
  
  //create a new array
  const newArray = []

  //loop over the array passed to the function
  for (let index = 0; index < arr.length; index += 1){
    //Push the result of the callback into the new array
    newArray.push(callback(arr[index], index))
  }

  //after done looping, return the resulting array
  return newArray

}

```

So that is how map works under the hood. A function like this one that takes another function and enhances it are typically called higher order functions. Think of higher order functions as functions that can do a wide variety of things depending on the function passed in like a vacuum with multiple heads to use it in different ways.

## Recursive Functions

Recursive functions are functions that call themselves in their definition which can be quite confusing when your first see them. Recursive functions can be used like loops and in certain situations can help make certain solutions easier or even possible in the case of tree like data structures. So to help illustrate this let's convert the map function into a recursive function.

```js

const map = (oldArray, callback, newArray = []) => {

    //base case: check if there are any items left in the original array to process
    if (oldArray.length <= 0){
      //if all items have been processed return the new array
      return newArray
    } else {
      //destructure the first item from old array and put remaining in a separate array
      const [item, ...theRest] = oldArray
      // create an array of the current new array and the result of the current item and the callback function
      const interimArray = [...newArray, callback(item)]
      // return a recursive call to to map to process the next item.
      return map(theRest, callback, interimArray)
    }
  
  }

  console.log(map([1,2,3,4,5,6], x => x+1))

```

So a recursive function should always start with a check for a base case.

*a base case is a condition in which the function returns a value, if this base case is not met then it will conduct some operations then return a recursive call to itself*

- So if the oldArray passed in has no elements it means all the elements have been processed so the newArray should be returned

- If there are elements in the array, it processes the next element, updates the new array and passes in the remaining array and the updated newArray into a recursive call which is returned (you must return the recusive call). **NOTE** I am using array destructuring to break up the array.

- Once the base case has been met the newArray is returned which becomes the return value for all recursive calls before it.

There you go, that is how you take the array map function and turn it into a recursive function!