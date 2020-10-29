---
title: merced-react-hooks: Application State, LocalStorage, Lifecycle
date: "2020-10-29T22:12:03.284Z"
description: Utility Hooks Library for React
---

**merced-react-hooks VIDEO PLAYLIST:** https://www.youtube.com/playlist?list=PLY6oTPmKnKbYurl9-_fSMY4X6DZ1sx39s

## The Purpose

While of course I always enjoy creating new tools, there was a few reasons I wanted to create this library.

- To reduce boilerplate in very common react patterns (do we really need to create the same handleChange function over and over again)

- Make the use of existing React features more semantic. (useEffect isn't as semantic as "componentWillMount")

- Introduce some alternative patterns I think may be good alternatives (wouldn't it be nice to easily do async action in your application state)

**merced-react-hooks** has several custom hooks that are aimed at accomplishing the above.

## Application Level State

Often you have two main choices when achieving application level state. Using the Redux library which has a lot boilerplate in its setup or use a combo of useContext and useReducer to get a basic redux like setup. I've created two tools

### useDataStore

This automates a lot of the boilerplate in the useContext/useReducer path. First you create a ds.js file with the following.

```js
import { createDataStore } from "merced-react-hooks"

//initialState
const initialState = {
  token: "",
  baseURL: "",
  count,
}

//reducer function
const reducer = (state, action) => {
  switch (action.type) {
    case "add":
      return { ...state, count: state.count + payload }
      break
    case "sub":
      return { ...state, count: state.count - payload }
      break
    default:
      return state
      break
  }
}

//create provider and consumer hook
export const [DataStore, useDataStore] = createDataStore(initialState, reducer)
```

then you add it to index.js and you are good to go!

```js
import { DataStore } from "./ds.js"

ReactDOM.render(
  <DataStore>
    <App />
  </DataStore>
)
```

then just use the hook to pull the state and dispatch in the component you plan on using it in.

Component.jsx

```js
import { useDataStore } from "../ds.js"

const Component = props => {
  //pull out the DataStore
  const { dataStore, dispatch } = useDataStore()

  return (
    <>
      <h1>{dataStore.count}</h1>
      <button onClick={() => dispatch({ type: "add", payload: 1 })}>add</button>
      <button onClick={() => dispatch({ type: "sub", payload: 1 })}>add</button>
    </>
  )
}
```

### TaskRunner

While DataStore certainly simplified the combo of Context/Reducer hooks but the problem with a reducer is the following...

- The reducer must always return a value that becomes the new value of state
- You can't do async operations in the reducer function, so async logic would still exist out side your reducer.

So I created the TaskRunner to give a near identical patter that addresses the above two problems. The big difference is that instead of a reducer function you are passing taskList object and each key is a function that is called via the taskRun function.

Each function in the taskList is passed the state, setState and payload. So you can decide whether a particular function should even setState at all or do async operations and setState within the async operations.

It all starts with tr.js file in your src folder...

```js
import { createTaskRunner } from "merced-react-hooks"

//initialState
const initialState = {
  token: "",
  baseURL: "",
  count,
}

//reducer function
const taskList = {
  add: (state, setState, payload) =>
    setState({ ...state, count: count + payload }),
  sub: (state, setState, payload) =>
    setState({ ...state, count: count - payload }),
}

//create provider and consumer hook
export const [TaskStore, useTaskStore] = createTaskRunner(
  initialState,
  taskList
)
```

then you add it to index.js and you are good to go!

```js
import { TaskStore } from "./tr.js"

ReactDOM.render(
  <TaskStore>
    <App />
  </TaskStore>
)
```

then just use the hook to pull the state and dispatch in the component you plan on using it in.

Component.jsx

```js
import { useTaskStore } from "../tr.js"

const Component = props => {
  //pull out the DataStore
  const { taskStore, runTask } = useTaskStore()

  return (
    <>
      <h1>{dataStore.count}</h1>
      <button onClick={() => runTask("add", 1)}>add</button>
      <button onClick={() => runTask("sub", 1)}>add</button>
    </>
  )
}
```

When you compare this to using reducers and dispatch, you have more flexibility and it looks a little less verbose. Win!

## useFormState

When doing controlled forms in React there is some annoying boilerplate.

- creating state for your form
- creating a handleChange function to update state
- resetting the form after submission

The useFormState hook does exactly this. You pass it the initialState and it will return the state, a handleChange function, and a resetForm function for resetting the form back to initial.

```js
import { useFormState } from "merced-react-hooks"

const Form = props => {
  const [formData, handleChange, resetForm] = useFormState({
    name: "",
    age: 0,
  })

  const handleSubmit = event => {
    event.preventDefault()
    console.log(formData)
    resetForm()
  }

  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        name="name"
        value={formData.name}
        onChange={handleChange}
      />
      <input
        type="number"
        name="age"
        value={formData.name}
        onChange={handleChange}
      />
      <input type="submit" value="click me" />
    </form>
  )
}
```

## useLocalStorage and useSessionStorage

Sometimes you need to line up your state with a key in local/session storage. These hooks will...

- Check if the key already exists and if so set the state
- If not, create the key and set the state to the initialState argument
- return the state, setState, and reset function

I highly recommend watching the video on these hooks in the video playlist at the beginning of this post to see this hook in action.

## Lifecycle Hooks

The useEffect hook serves all the role of functions like componentWillMount, componentWillUpdate, and ComponentWillUnmount would have. While I prefer the react hooks patterns the semantic names of these functions certainly made the intention of these functions clearer.

I made hooks that are a light abstraction over useEffect to make your code more declarative and semantic.

```js

import {useOnMount, useOnUpdate, useOnDismount} from "merced-react-hooks"

const Child = (props) => {

  useOnDismount(() => console.log("I don't exist anymore"))

  return <h1> Look! I exist </h1>
}

const App = (props) => {

  const [toggle, setToggle] = React.useState(false)

  useOnMount(() => console.log("I happen onMount"))

  useOnUpdate(()=>console.log("I happen on update), [toggle])

  return (<>
    {toggle ? <Child/> : null}
    <button onClick={() => setToggle(!toggle)}>Click Me</button>
  </>)
}

```

## Conclusion

I plan on continuing to add more hooks to this library if your using tree shaking in your build process you'll only be bundling what you need since everything is a named export and no hook depends on another hook in this library. So you got tools and you can use them efficiently! I hope you enjoy!