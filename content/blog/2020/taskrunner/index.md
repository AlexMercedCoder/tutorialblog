---
title: React - Why use TaskRunner over Redux, useReducer
date: "2020-12-24T12:12:03.284Z"
description: "A State Management Alternative"
---

## What is the story?

In recent months I've spent some time with Redux and useReducer and while I like the idea of having all my larger stateful logic located in one place there were a few things I did not like.

- because the Reducer must return the new state/store, it made it impossible to do asynchronous actions in the reducer without turning your state into a promise. So you'd have to do asynchronous actions prior to calling dispatch which still leaves some of the logic inside your components.

- Couldn't have non-stateful actions, which is fine as it's not really the point of the reducer but why not be able to go step further in centralizing app logic in one place.

So I ventured to come up with a similar but alternative approach.

## What is the TaskRunner?

In my new approach, instead of a function with a switch or series of if/else statements, I preferred to use an object with several functions associated with it's key. Each function is passed the current state, the setState function and the payload. The benefits of this are...

- Instead of the function return value setting the state, you can set the state wherever you like meaning even after asynchronous actions (inside the .then or with an await).

- The function doesn't have to alter the state at all, so support functions or other logic that may be used in more than one component can live in the TaskRunner.

To make this easier I created a library of custom hooks, merced-react-hooks, which is available on npm. Let's walk through how to use the TaskRunner pattern.

## How-To

1.  Create a new react project

2.  install the custom hooks `npm install merced-react-hooks`

3.  In your data store create a tr.js file with the following sections.

        - Define the initialState and TaskRunner

        - Create and Export the TaskStore and useTaskStore hook

```js

        import {createTaskRunner} from "merced-react-hooks"

        //The Initial State
        const initialState = {
            count: 0
        } 

        //The Task List, list of functions to run
        const taskList = {
            add: (state, setState, payload) => {
                setState({...state, count: state.count + payload})
            },
            sub: (state, setState, payload) => {
                setState({...state, count: state.count - payload})
            }
        }

        //Generate the TaskStore and useTaskStore hook
        export const [TaskStore, useTaskStore] = createTaskRunner(
            initialState,
            taskList
            )

```

4. Then import the TaskStore Provider Component into index.js to provide the state

```js
// index.jsx
import {TaskStore} from "./tr.js"
 
ReactDOM.render(<TaskStore><App/></TaskStore>)

```

5. Use the useTaskStore hook to bring in the taskStore (the state) and RunTask (Equivalent to Dispatch in redux) into a component. The run task function takes two arguments a string of which function/task should be run, and a second payload argument with any data you want to use in the task.

```js

// /components/component.jsx
import React from "react'
import {useTaskStore} from "../tr.js"
 
const Component = (props) => {

  //Get TaskRunner store and runTask function  
  const {taskStore, runTask} = useDataStore()
 
  //Invoke runTask to run a task and update the taskStore
  return <><h1>{taskStore.title}</h1>
  <button onClick={() => runTask("add", 5)}>Click Me</button>
}

```
