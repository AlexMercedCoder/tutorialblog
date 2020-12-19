---
title: Rollout Application Level State Quickly with useDataStore
date: "2020-10-15T22:12:03.284Z"
description: Context, Reducers and Hooks, yes!
---

## What is useDataStore?

useDataStore is a mini-library I created that just just abstracts away a lot of the boilerplace is using Context and useReducer to create Redux like App wide state.

## How do you Install

Install in your react project using npm

```npm install usedatastore```

## Creating your DataStore Components and usedataStore hook.

The Library provides you with one function, createDataStore. This function takes two arguments. The initial state and the reducer function. The function does a few things for us.

*If you are not familiar with a reducer function, it takes the state and an action which can be anything. The return value of the function becomes the new state*

- Creates the context
- Creates a component that wraps its children in the context provider
- Creates state and a dispatch function using useReducer which is then passed to the provider in it's value prop
- returns an array with the component (DataStore) and a hook to extract content(useDataStore)

Best practice is to house the initialState, the reducer and invoke createDataStore in a file called ds.js in your /src folder. Here is an example...

```js
import {createDataStore} from "usedatastore"
console.log(createDataStore);

const initialState = { count: 0 };

const reducer = (state, action) => {
  switch (action.type) {
    case "add":
      return { ...state, count: state.count + action.payload };
      break;
    case "sub":
      return { ...state, count: state.count - action.payload };
      break;
    default:
      return state;
      break;
  }
};

export const [DataStore, useDataStore] = createDataStore(initialState, reducer);
```

## Adding the Provider Component

In your App.js you can do something like this...

```js
import React from "react";
import {DataStore} from "./DS"
import {Other} from "./Other"

export const App = (props) => {
  return <DataStore><Other/></DataStore>;
};
```

## Using the state and dispatch function

Now you can just import the useDataStore hook into any component and be able to quickly update or use the application DataStore!

```js
import React from "react";
import { useDataStore } from "./DS";

export const Other = (props) => {
  const { dataStore, dispatch } = useDataStore();

  return (
    <>
      <h1>{dataStore.count}</h1>
      <button onClick={() => dispatch({ type: "add", payload: 1 })}>Add</button>
      <button onClick={() => dispatch({ type: "sub", payload: 1 })}>
        Subtract
      </button>
    </>
  );
};
```

**NOTE:** In the example above I'm using the pattern often used in redux which is the following.

- The action argument passed to dispatch/reducer is an object with a type and payload property
- The type property is a string passed into a switch to determine what update should be made to state
- The payload is extra details needed for the action to complete

The point of this pattern is to move a lot of your core application login into the reducer function and make your components less verbose and logic easier to find. Downside... less encapsulation making components less reusable between applications.