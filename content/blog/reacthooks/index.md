---
title: React Hooks Basics Reference
date: "2020-09-23T22:12:03.284Z"
description: useEffect, useState, UseReducer and more!
---

## What are React Hooks?

In the early days of react, only class components were stateful so things like state management and lifecycle really only mattered when working with classes. In recent years, React introduces stateful functional components use React hooks. From what I can tell, these hooks make clever use of closures to replicate the behavior easily possible in classes. To understand how closures work watch this video of mine => https://www.youtube.com/watch?v=qlojKKUvK7w

### useState

The useState hook is pretty straightforward, it's state in a functional component. Essentially you create a piece of state/reactive data by using the useState function like so...

```js
const [state, setState] = React.useState(initialState)
```

So the variable, "state", is your state and can be used like you'd always use state in React (if you are unfamiliar with React check out my React playlist at devNursery.com). "setState" is a function you can use to change the value of state, this is important cause only by changing the value through setState does the component re-render to reflect the state changes.

Another really big plus with hooks is that you can use them multiple times, so instead of having one large object with all your state like in class components you can create piece of state as needed using the useState hook.

```js
const [name, setName] = React.useState("Alex Merced")
const [age, setAge] = React.useState(35)
```

## useEffect

Lifecycle is a big deal in any frontend library. Lifecycle hooks allow you to run code before the component mounts or after it is destroyed. In class components you'd just define functions like componentDidMount(), componentDidUpdate() and componentWillUnmount() and define what you wanted to do. What would this be used for?

- Before a component renders is a typical place to make AJAX/Fetch requests for data the component needs to build its UI.

- After a component is destroyed is a good time to remove listener on other elements listening for events from the destroyed component.

In functional components instead there is just one function that can be used in multiple ways, useEffect.

```js
React.useEffect(() => {
  //This is where stuff would happen the first time a component renders, and anytime any variable passed into the dependency array changes.

  return () => {
    //The function returned by useEffect only runs when the component is destoryed/removed
  }
}, [dependency1, dependency2])
```

So useEffect takes two arguments, a callback and dependency array. The callback always runs on first render and will repeat if any value in the dependency array changes. If the callback returns a function, that function will run when the component is removed.

## useRef

The useRef hook creates a ref, which can be used to create a variable to access an element in your JSX as a DOM node with all the properties we'd want to use in a DOM node. Here is an example below.

```js

const MyComponent = (props) => {
    const input = useRef(null)

    const handleClick = (event) => console.log(input)

    return (<div>
                <input ref={input} value=5/>
                <button onClick={handleClick}>Click Me </button>
            </div>)
}

```

In the code above if click the button it'll print the variable input, which is a ref on the input tag. You can find all sorts of useful properties this way. I've even used this to access hidden functions in third party components.

## useContext

The React context API allows us to make information available to an entire tree of components. The useContext hook makes using them in children so much easier. The benefit of context is that data provided by one component can be accessed by grandchildren and great-grandchildren without having to pass them as props at each level.

**Creating Context**

```js
const MyContext = React.createContext(null) //Creates Provider/Consumer

const MyComponent = props => {
  const [state, useState] = React.useState(initialState)

  return (
    <MyContext.Provider value={state}>
      <ChildComponent />
    </MyContext.Provider>
  )
}
```

The provider component makes the data available to any of the child components, just import the context into that component and grab the data like so.

```js
import MyContext from "./somefile"

const GreatGrandchild = props => {
  const greatGrandpasState = React.useContext(MyContext)

  return <h1>{greatGrandpasState}</h1>
}
```

So I can do the above without ever having to play with the data in the child or grandchild. Very Nice!

## useReducer

The useReducer hook essentially builds in the basic functionality of the Redux library into React natively (Redux has some extra bells and whistles but this provides the main thrust).

Essentially the pattern is this, instead of using a setState function to alter state directly you do the following.

- You invoke a Dispatch function which is passed an action (typically an object with a "type" property and "payload" property, but that's just convention)

- The action is passed to a previously defined reducer function which uses a switch or if statements to determine what it does based on the actions type, the value this function returns becomes the new state.

let's look at an example...

```js
const initialState = { count: 1 }

const reducer = (state, action) => {
  switch (action.type) {
    case "add":
      return { ...state, count: state.count + action.payload }
      break

    case "sub":
      return { ...state, count: state.count - action.payload }
      break

    default:
      return state
  }
}

const MyComponent = props => {
  const [state, dispatch] = React.useReducer(reducer, initialState)

  return (
    <div>
      <h1>{state.count}</h1>
      <button onClick={() => dispatch({ type: "add", payload: 1 })}>Add</button>
      <button onClick={() => dispatch({ type: "sub", payload: 1 })}>
        Subtract
      </button>
    </div>
  )
}
```

So in the example above, if you click the add button, the dispatch function is invoked and is passed `{type: "add", payload: 1}` as the action. It is passed into the reducer function which passes action.type to switch which will match with "add" and add the amount of payload to the count property. The benefit of this approach is the logic of your state changes are less in your component and all in one central place, the reducer.

To get the full redux like experience you can use context to pass the dispatch function to the entire component tree.

If you want a React Template that has all this already configured run the following command.

`npx merced-spinup reactreducer myproject`
