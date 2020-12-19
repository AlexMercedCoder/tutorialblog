---
title: Using mutils to supercharge arrays!
date: "2020-10-17T22:12:03.284Z"
description: Arrays with superpowers!
---

## What is mutils?

mutils is the third in a series of libraries I created in trying to add some extra function to arrays. Let's explore the history to put this library in context.

**MercedUtils:**  The first version of this library. I wanted to add more array methods and discovered I could add them to the array prototype. This library adds several methods to the array prototype, at this point I learned from others why this is an anti-pattern... because if everyone just added functions to arrays there would possibly be name collisions. So I created a new library taking a different approach.

**BetterTypes:** In this iteration I created new classes that would take an array and using the eval function and some other tools I was able to replicate all the array methods, but the user experience was definitly not as smooth. Then I learned I could extend the array class.

This brings us to mutils where by extending the Array and Set objects I am able to add plenty of array methods.

## How do you Install

Install in your project using npm

```npm install mutils_am```

them import into your file

```const {Rand, MSet, MArray} = require("mutils_am")```

## Rand

The Rand object has several Random number methods.

**Rand.index(Array) =>** Return random number 0 - Array.length

**Rand.range (Low, High) =>** Return number between low and high

**Rand.num (Number) =>** Return random number 0 - Number

## MArray

Create a new MArray object like so...

```const myArray = new MArray(1,2,3,4,5)```

On top of all the regular array methods (pop, shift, unshift, push, filter, map, etc.) you have all these additional methods!

**MArray.random() =>** return random element from array

**MArray.remove((value, index) => return boolean) =>** the opposite of filter, remove elements where the callback function returns true, returns a MArray

**MArray.undupe() =>** returns a MArray of the array with duplicates removed

**MArray.randElim() =>** eliminates a random element and returns it

**MArray.leaveOne() =>** Randomly eliminates all but one element from array and returns a MArray of removed elements

**MArray.leaveSome(number) =>** Randomly eliminates all but a defined number of elements from array and returns a MArray of removed elements

**MArray.findRemove(value) =>** finds and removes value from array returning the removed value

**MArray.addLength(length, value) =>** increases array to desired length and fills in additional spots with the value passed. Returns itself.

**MArray.lessLengthRight(length) =>** removes elements from back of the array till is desired length, returns array of removed values. Returns itself.

**MArray.lessLengthRight(length) =>** removes elements from front of the array till is desired length, returns array of removed values. Returns itself.

**MArray.someMore((value, index) => return boolean, number) =>** returns true if the number of iterations that return true are equal or greater to the number argument

**MArray.everyLess((value, index) => return boolean, number) =>** returns true if the number of iterations that return false are equal or less to the number argument

**MArray.MapToObject((value, index) => return [key, value]) =>** like map but returns an object, the callback function must return a two element array [key, value]

**MArray.MapToMap((value, index) => return [key, value]) =>** like map but returns a Map, the callback function must return a two element array [key, value]

**MArray.MapToSet((value, index) => return [key, value]) =>** like map but returns a Set

**MArray.MapToUnique((value, index) => return [key, value]) =>** like map but returns an Array of only unique elements

**MArray.squish() =>** removes the first and last elements of the array and returns them in an Marray

**MArray.shuff() =>** return shuffled version of Marray

**MArray.toStrings() =>** return array with all elements casted as strings

**MArray.toNums() =>** return array with all elements casted as Numbers

**MArray.toBools() =>** return array with all elements casted as Booleans

**MArray.iPop() =>** immutable pop, return new version of Marray with last value popped

**MArray.iPush(value) =>** immutable push, return new version of Marray with value pushed into end of array

**MArray.iShift() =>** immutable shift, return new version of Marray with first value removed

**MArray.iUnshift(value) =>** immutable unshift, return new version of Marray with value added at beginning of array

**MArray.iSplice(index, amount) =>** immutable splice, return new version of Marray with the specified number of elements removed starting with the specified index.

## MSet

How you create an MSet

```const pset1 = new MSet([1, 2, 3, 4]);```

**MSet.isSuperset(MSet) =>** Returns true if the MSet is a superset of the MSet passed as an argument

**MSet.union(MSet) =>** Returns a MSet that is a combination of this MSet and the MSet passed in as an argument.

**MSet.intersection(MSet) =>** returns MSet of elements in common between two MSets

**MSet.symmetricDifference(MSet) =>** returns MSet of elements not shared by both MSets

**MSet.difference(MSet) =>** returns MSet of elements not shared by this array with the passed in array