---
title: Ultimate 2021 Reference for React Functional Components
date: "2021-04-21T12:12:03.284Z"
description: React for Everyone
---

[I will Continue to Expand on Guide in this Gist](https://gist.github.com/AlexMercedCoder/b4d86790176f2f5c7b374235cf3dc23c)

## React Project Generators

There is a huge world of generators for a React Project. First off, there is always the generator that comes straight from Facebook/React, create-react-app.

`npx create-react-app appName`

Easy enough! Here are many of the templates I maintain through my merced-spinup generator tool.

- Basic React Template `npx merced-spinup react appName`
- Bare Bones React with Webpack `npx merced-spinup react basicreact`
- React w/ Webpack `npx merced-spinup reactwebp appName`
- React w/ Router `npx merced-spinup reactrouter appName`
- React with Redux `npx merced-spinup reactredux appName`
- React with useReducer `npx merced-spinup reactreducer appName`
- React w/ Typescript `npx merced-spinup reactts appName`
- React with No Bundler (Script Tags) `npx merced-spinup reacthtml appName`
- React with Rollup `npx merced-spinup reactrollup appName`
- React with Sass/Bootstrap `npx merced-spinup reactsassbootstrap appName`
- React with Sass/MaterialUI `reactsassmaterialui`
- React with Sass/Context `npx merced-spinup reactsasscontext appName`
- React with Styled Components `reactstyled`
- React with JSS `npx merced-spinup reactjss appName`
- React with everything `npx merced-spinup reactloaded appName`
- React with Parcel `npx merced-spinup rreactparcel appName`
- React Loaded using Snowpack `npx merced-spinup snowreactloaded appName`
- React Loaded using Snowpack and my custom TaskRunner state management pattern `npx merced-spinup snowreacttask appName`

The only bundler I didn't cover in the above is Vite which can be generated like so...
`npm init @vitejs/app appName --template react`

Feel free to post more in the comments!

Always make sure to read the package.json to know what scripts turn on the dev server and trigger the build process!

## Writing React Functional Components

You can write a react component using any method of writing functions. Check out the the below snippet.

Basically any function that returns JSX (HTML Like Syntax) React will treat as a component.

```js
// Function Declaration
function Component1(props) {
  return <h1> Hello World </h1>
}

// Function Expression
const Component2 = function (props) {
  return <h1>Hello World</h1>
}

// Arrow Function
const Component3 = props => {
  return <h1> Hello World </h1>
}

// Showing them in use
function App(props) {
  return (
    <div>
      <Component1 />
      <Component2 />
      <Component3 />
    </div>
  )
}
```

## Rules of JSX

JSX is the HTML like syntax we can use in React Components. There are several rules to keep in mind.

### 1. ONLY ONE TOP-LEVEL ELEMENT

##### GOOD

The div is the only top-level element

```html
<div>
  <h1>Hello World</h1>
  <p>lorem ipsum</p>
</div>
```

##### BAD

The h1 and p are both at the top-level, this will cause an error.

```html
<h1>Hello World</h1>
<p>lorem ipsum</p>
```

##### Also Good

If you really don't want to wrap the content in a div you can use empty tags which is called a "Fragment"

```html
<>
<h1>Hello World</h1>
<p>lorem ipsum</p>
</>
```

### 2. Attributes are camelCase

All HTML attributes you are use to become camel case when writing them in JSX.

- onclick becomes onClick
- onchange becomes onChange
- onSubmit becomes onSubmit
- class becomes className (why? because the class keyword is already used in javascript)

You get the idea.

### 3. Inline styles in JSX

In normal html a inline style would be written like this.

```html
<div style="display: flex; background-color: blue;">dfsfsfsdfsdf</div>
```

But JSX is NOT HTML it is just an HTML like abstraction over Javascripts DOM API. So when writing inline styles your dealing with the style object of the DOM node, so instead of a string you pass an object that will be merged into that nodes style object. Since it's javascript, all the CSS style attributes are now camel case instead of hyphenated.

```html
<div style={{display: "flex", backgroundColor: "blue"}}>dfsfsfsdfsdf</div>
```

### 4. ARRAYS WORK

You can pass arrays of JSX if you want.

```jsx
return [<h1>Hello World</h1>, <h1>Hello World</h1>, <h1>Hello World</h1>]
```

Is the same as me writing

```jsx
return (
  <>
    <h1>Hello World</h1>
    <h1>Hello World</h1>
    <h1>Hello World</h1>
  </>
)
```

### 5. INJECTING JAVASCRIPT EXPRESSIONS

Your JSX is treated as html, and anything in curly brackets are treated as Javascript expressions in the functions scope. Any valid javascript expression can be used this way.

```jsx
return <h1> I am {30 + 5} years old </h1>
```

## Props

Props allows a component to receive data from its parent component.

Some rules

- Props can only be sent from a parent to a child
- If the parent needs data from the child it should send a function as a prop then the child can pass its data to the function as an argument.
- Anything can be sent as a prop, include JSX

```jsx
//The Child Component
const Child = props => {
  //change the value of someVariable using function sent via props
  props.setter(8)

  return <h1>{props.stuff}</h1>
}

// THe Parent Component
const Parent = props => {
  let someVariable

  //function to set someVariable
  const setSV = data => {
    someVariable = data
  }

  // send down two props, stuff and setter
  return <Child stuff="hello world" setter={setSV} />
}
```

## The useState Hook

The useState hook allows us to generate variables that are special, as updating them would trigger your component and its children to update.

First step is always importing the useState hook.

```js
import { useState } from "react"
```

Inside the body of your component function you can then initiate a state variable. The name convention is "state" for the variable and "setState" for the function that updates the states value.

If I wanted to create state for a counter it would look like this.

```js
// initiate counter at 0, setCounter let's me update counter
const [counter, setCounter] = useState(0)
```

So a simple counter component would look like this...

```jsx
import { useState } from "react"

const Counter = props => {
  // Declare the state
  const [counter, setCounter] = useState(0)

  // Function to add one to the state
  const addOne = () => {
    // sets counter to its current value + 1
    setCounter(counter + 1)
  }

  // The h1 display the counter and button runs addOne function
  return (
    <div>
      <h1>{counter}</h1>
      <button onClick={addOne}>Click Me to Add One</button>
    </div>
  )
}
```

That's as simple as it gets. What happens when the button is clicked.

- setCounter is passed the current value + 1
- React then compares this new value to the old value of counter
- If they are the same, React does nothing (beware of references as values when it comes to objects and arrays)
- If they are different then React does updates its VirtualDOM based on a re-render of the component and its children
- It then compares the virtualDOM to the real browser DOM and only updates the places in which they differ.

The above process is why variables that are "State" are reactive, meaning the DOM will updates when the value updates. All other variables are not reactive and will not trigger updates when changed.

**NOTE**: If the state is an object or array, make sure you pass a new array or object and not just modify the old one. Objects and Arrays are references, so if you pass the old array with modified values the references will still be equal so there will be no update to the DOM.

Example...

Don't do this

```js
// modify the existing state
state[0] = 6
// then setState as the existing state, triggering NO update
setState(state)
```

Do this

```js
// create a unique copy of the array
const updatedState = [...state]
// modify the new array
updatedState[0] = 6
// set the State to the updatedArray, DOM will update
setState(updatedState)
```

## The useEffect Hook

Here is our counter component from earlier with a console.log and second piece of state.

```jsx
import { useState } from "react"

const Counter = props => {
  // Declare the state
  const [counter, setCounter] = useState(0)
  // second piece of state
  const [evenCounter, setEvenCounter] = useState(0)

  console.log("I'm just a random log")

  // Function to add one to the state
  const addOne = () => {
    // if counter is even before the update, update evenCounter
    if (counter % 2 === 0) {
      setEvenCounter(evenCounter + 1)
    }
    // sets counter to its current value + 1
    setCounter(counter + 1)
  }

  // The h1 display the counter and button runs addOne function
  return (
    <div>
      <h1>{counter}</h1>
      <h1>{evenCounter}</h1>
      <button onClick={addOne}>Click Me to Add One</button>
    </div>
  )
}
```

So right now this component displays both counter in its JSX

- when we click the button counter will always go up by 1
- if counter is even before it is increased, evenCounter will go

Any code in the function body will run again on every render of the component. The component will render with every change of state. So in this case if we keep clicking the button that console.log will run again and again.

What if we only want it to run when evenCounter changes.

This is where the useEffect hook comes into play. This hook is a function that takes two arguments:

- A function that will be run immediately when the component loads and anytime any value in the second argument changes
- An array of values, when they change the function will run again. Usually an empty array if you never want the function to run again.

```jsx
import { useState, useEffect } from "react"

const Counter = props => {
  // Declare the state
  const [counter, setCounter] = useState(0)
  // second piece of state
  const [evenCounter, setEvenCounter] = useState(0)

  //making sure console.log only runs on certain renders
  useEffect(() => {
    console.log("I'm just a random log")
  }, [evenCounter])

  // Function to add one to the state
  const addOne = () => {
    // if counter is even before the update, update evenCounter
    if (counter % 2 === 0) {
      setEvenCounter(evenCounter + 1)
    }
    // sets counter to its current value + 1
    setCounter(counter + 1)
  }

  // The h1 display the counter and button runs addOne function
  return (
    <div>
      <h1>{counter}</h1>
      <h1>{evenCounter}</h1>
      <button onClick={addOne}>Click Me to Add One</button>
    </div>
  )
}
```

So notice the useEffect receives a function that executes our log, and we also gave it an array with evenCounter in it. This means...

- The function will run once when the component is first loaded
- The function will run again only when evenCounter changes

useEffect is more regularly used for API calls. Usually you'll call the API, get the data then update state inside a useEffect to prevent an infinite loop from occurring.

```jsx
useEffect(() => {
  axios(URL).then(data => setState(data))
}, [])
```

Also if the function given to useEffect returns a function, the returned function will be run when the component is removed from the DOM useful for remove event listeners that may be left behind (not something that should come up often)

## The useRef hook

Think of the useRef hook kind of like document.querySelector, it let's you assign a DOM node to a variable so you can access its properties. React declarative (express what you want, not how to make it) nature makes it hard to write normal imperative (how to make the thing step by step) DOM code. So if you need to get access to a DOM node like an input you can do the following:

```jsx
import { useRef } from "react"

const Component = props => {
  // create a new ref, we'll assign it in our JSX
  const inputRef = useRef(null)

  const handleClick = () => {
    //log the inputs elements value
    console.log(inputRef.current.value)
  }

  return (
    <div>
      <input type="text" ref={inputRef} />
      <button onClick={handleClick}>Click Me</button>
    </div>
  )
}
```

## Form Handling

There are two ways to handle forms in React.

- **Controlled Forms:** The value of the inputs are bound to state, so value of state and the value of the inputs are always in sync.

- **Uncontrolled Forms:** The forms are not bound by state, instead their values are pulled using a ref when needed.

### Example of a Controlled Form

Parts:

- object holding form values as state
- handleChange function that updates the state when we type into the form
- handleSubmit function to handle form submission and do what you want with the data

```jsx
import { useState } from "react"

const Form = props => {
  //State to hold the form data
  const [form, setForm] = useState({
    name: "",
    age: 0,
  })

  // handleChange function
  const handleChange = event => {
    // dynamically update the state using the event object
    // this function always looks the same
    setForm({ ...form, [event.target.name]: event.target.value })
  }

  const handleSubmit = event => {
    // prevent page refresh
    event.preventDefault()
    // do what you want with the form data
    console.log(form)
  }

  // The JSX for the form binding the functions and state to our inputs
  return (
    <form onSubmit={handleSubmit}>
      <input
        type="text"
        value={form.name}
        onChange={handleChange}
        name="name"
        placeholder="write name here"
      />
      <input
        type="number"
        value={form.age}
        onChange={handleChange}
        name="age"
        placeholder="write age here"
      />
      <input type="submit" value="Submit Form" />
    </form>
  )
}
```

### Example of an Uncontrolled Form

- a ref created for each input
- handleSubmit for when form is submitted

```jsx
import { useRef } from "react"

const Form = props => {
  // ref to get input values
  const nameInput = useRef(null)
  const ageInput = useRef(null)

  const handleSubmit = event => {
    // prevent page refresh
    event.preventDefault()
    // do what you want with the form data
    console.log({
      name: nameInput.current.value,
      age: ageInput.current.value,
    })
  }

  // The JSX for the form binding the functions and state to our inputs
  return (
    <form onSubmit={handleSubmit}>
      <input type="text" ref={nameInput} placeholder="write name here" />
      <input type="number" ref={ageInput} placeholder="write age here" />
      <input type="submit" value="Submit Form" />
    </form>
  )
}
```

## State Management

State is the most important concept in React, your app is "reactive" because you have state for data your UI depends on. As Apps get more complex, deciding how to handle state and where it should be housed can get quite daunting.

Here are some questions to use as a guide.

**This Piece of State is Used in how many components?**

![The React Component Tree](https://i.imgur.com/yaERGHf.png)

- 0-1: It should be in the one component using it and nowhere else
- 2-5: It should be located in a parent all the components share but as low in the component tree as possible
- 5+: Time to consider Context

#### Prop Drilling

This is the inevitable tragedy that occurs when your components trees grow to several layers. Imagine a piece of state is in a component that is needed in a grandchild component... you'd have to do the following.

```jsx
const GrandChild = props => <h1>{props.data}</h1>

const Child = props => <GrandChild data={cheese} />

const Parent = props => <Child cheese="gouda" />
```

This is prop drilling, the Parent passes cheese to child, who passes the same data as data to GrandChild. Imagine if it was a Great-Great-Grandchild... that's a lot of typing just so one component can receive a single piece of data.

There are several solutions to this.

- React Context
- React useReducer Hook
- [The TaskRunner Pattern](https://tuts.alexmercedcoder.com/2020/taskrunner/)
- Redux
- And many more... (MobX, State Machines, ...)

Let's cover a few!

### Context

What context allows us to do is to create an object that be passed directly to children of any level without having to pass them around as props. If props were like walking down several flights of stairs, Context is liking taking an elevator to where you need to go, faster and easier.

```jsx
import { createContext, useContext } from "react"

//create the context object
const context = createContext(null)

const GrandChild = props => {
  // consume the data from the provider in parent
  const ctx = useContext(context)
  return <h1>{ctx}</h1>
}

// notice... no props pass through child in this scenario
const Child = props => <GrandChild />

// the context provider determines what data the parent provides its children
const Parent = props => (
  <context.Provider value={"cheese"}>
    <Child />
  </context.Provider>
)
```

So notice, because we used Context, the parent component was able to pass data directly to it's grandchild without having to pass any props. Context makes transporting data across your components much easier. The only downside is the direction of the data and where it is used will be a little less obvious to a random spectator.

### The useReducer Hook

Before context many use Redux for state management. Not only did Redux allow you to store all your state in one place (the Redux Store) but also allowed you to house all your stateful logic in one place called the Reducer function.

The reducer function would normally be passed an "action" which is an object with two properties. This action was passed to the reducer calling a "dispatch" function.

- type: A string that is passed to a switch to determine how to update the state

- payload: Any data needed for the state update.

React eventually took the core Redux functionality and built it in to React as the useReducer hook. Below is a basic example of the useReducer hook.

```jsx
import { createContext, useContext, useReducer } from "react"

//create the context object
const context = createContext(null)

const GrandChild = props => {
  // consume the data from the provider in parent
  const ctx = useContext(context)
  // the h1 displays the state pulled from context
  // the buttons call dispatch and pass the action to the reducer
  return (
    <>
      <h1>{ctx.state}</h1>
      <button onClick={() => ctx.dispatch({ type: "add", payload: null })}>
        Add
      </button>
      <button onClick={() => ctx.dispatch({ type: "subtact", payload: null })}>
        Subtract
      </button>
    </>
  )
}

// notice... no props pass through child in this scenario
const Child = props => <GrandChild />

// the context provider determines what data the parent provides its children
const Parent = props => {
  // the reducer with our stateful logic
  const reducer = (state, action) => {
    // get the type and payload from the action
    const { type, payload } = action

    switch (type) {
      // determine how to update the state based on action type
      case "add":
        return state + 1
      case "subtract":
        return state - 1
      default:
        // if it doesn't match any type, keep the state as is
        return state
    }
  }

  // the initial value of the state
  const initialState = 0

  // create the state and the dispatch function
  const [state, dispatch] = useReducer(reducer, initialState)

  // pass the state and dispatch via context in an object
  return (
    <context.Provider value={{ state, dispatch }}>
      <Child />
    </context.Provider>
  )
}
```

## Learning More About React

- [React Router Masterclass](https://www.youtube.com/watch?v=UOh4WzovSpQ&t=19s)
- [The TaskRunner Patten (alternative to redux/useReducer)](https://www.youtube.com/watch?v=B0NHSDmPKlo)
- [Redux vs useReducer](https://www.youtube.com/watch?v=dEGVZy6PoAA)
- [Styled Components (React Styling Library)](https://www.youtube.com/watch?v=Loz7RYU-JKM)
- [React Forms with Formik](https://www.youtube.com/watch?v=T307WJ5eDOw)
