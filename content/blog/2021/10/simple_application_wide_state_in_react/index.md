---
title: Simple Setup for Application Wide State in React
date: "2021-11-20T12:12:03.284Z"
description: Sharing State Across Your React App with just React (No Redux or Recoil)
---

![Blog Title Image - React Application Wide State](https://i.imgur.com/shntfak.jpg)

- [For a lot of useful State Related Hooks, Checkout my Library merced-react-hooks](https://www.npmjs.com/package/merced-react-hooks)

To quick setup application wide state in your app just make a file called src/GlobalState.js in your react app.

GlobalState.js

```js
import { useState, createContext, useContext } from "react"

// The initial state, you can setup any properties initilal values here.
const initialState = {
    count: 0
}

// create the context object for delivering your state across your app.
const GlobalContext = createContext(null)

// custom component to provide the state to your app
export const GlobalState = props => {
  // declare the GlobalState
  const [globalState, setGlobalState] = useState({})

  // create a function that'll make it easy to update one state property at a time
  const updateGlobalState = (key, newValue) => {
    setGlobalState(oldState => {
      if (oldState[key] !== newValue) {
        const newState = { ...oldState }
        newState[key] = newValue
        return newState
      } else {
        return oldState
      }
    })
  }

  return (
    <GlobalContext.Provider value={[globalState, updateGlobalState]}>{props.children}</GlobalContext.Provider>
  )
}

// custom hook for retrieving the provided state
export const useGlobalState = () => useContext(GlobalContext)
```

then you just have wrap your application with the GlobalState component in index.js

```js
<GlobalState>
    <App/>
</GlobalState>
```

then in any component you can use the state. Below is an example of a counter component using the GlobalState.

```js
import {useGlobalState} from "../GlobalState.js"

function Counter(props){

    const [globalState, updateGlobalState] = useGlobalState()

    return <div>
    <h1>{globalState.count}</h1>
    <button onClick={() => updateGlobalState("count", globalState.count + 1)}>Add One</button>
    <button onClick={() => updateGlobalState("count", globalState.count - 1)}>Subtract One</button>
    </div>

}
```

There you go, now you can share state across your app in an easy that you can customize to your needs.