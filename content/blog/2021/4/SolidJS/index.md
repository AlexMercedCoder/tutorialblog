---
title: SolidJS - React meets Svelte?
date: "2021-04-09T12:12:03.284Z"
description: The new shiny frontend toy!
---

React is by far the biggest frontend Javascript framework in modern web development. Although, Svelte has been growing steadily in popularity over the last few years. What makes Svelte so special.

- Very easy to learn syntax

- Instead of shipping the framework to the browser the code is compiled to standard js, resulting in MUCH smaller bundle size and blazing fast code.

People already love or are at least pretty familiar with the React Syntax, but the latter benefit of compiling to standard JS could be a nice addition to React, enter SolidJS.

SolidJS is a frontend UI framework whose syntax is very similar to React but is compiled to modern javascript like Svelte is allowing people to get the speed and bundle sizes of Svelte but use the React syntax they are used to.

## Setting Up a SolidJS Project

Just run the following command to generate a new project...

```npm init solid app ProjectName```

or for typescript

```npm init solid app-ts ProjectName```

## What's the same

- The file structure of the generated project should feel pretty much like a create-react-app

- JSX still works like JSX

## State

So in React you would normally use the useState hook to generate a state variable and the process still pretty much works the same in SolidJS except now we use the createSignal function.

```js
import {createSignal} from "solid-js"
import './App.css';

function App() {

  // create state
  const [count, setCount] = createSignal(1)

  // add function
  const add = () => {
    //notice in this context I must invoke the state to get the value (not in jsx)
    setCount(count() + 1)
  }

  // JSX works like normal
  return (
    <div class="App">
      <h1>My Counter</h1>
      <h2>{count}</h2>
      <button onClick={add}>Add</button>
    </div>
  );
}

export default App;
```

One thing to be aware of is the while it looks like React, you are really getting back a getter and setter function, so notice we used count as a function in our add function. From what I can tell the setter emits an event after updating the state vs React which instead of an event re-runs the component function and optimizes duplicative work with a virtual dom.

## Lifecycle and createEffect

Here is where Thinking in Solid is very different in thinking in React. In React the whole component is a function that re-runs each time you state updates making infinite loops possible when changing the state on function calls in the component's function body. In React, the solution to this is to move this kind of code into it's own closure with the useEffect hook to run when desired not on every render of the component function.

Solid doesn't use a virtual DOM and on state updates it doesn't run the component function again. Instead, Reactive code is wrapped in createEffect calls which then re-runs the function when any signal inside of them are updated. The benefit of this is...

- You can make Fetch/Axios calls without having to wrap them in useEffect to avoid infinite loops

- JSX automatically will compile into createEffect calls which is why they will update when state updates.

So in the snippet below, the only code that reflects the updates to state is the JSX express and the code in the createEffect. Since neither uses count2, count2 triggers no changes on each update.

```js
import {createSignal, createEffect} from "solid-js"
import './App.css';

function App() {

  // create state
  const [count, setCount] = createSignal(1)
  const [count2, setCount2] = createSignal(1)

  // add function
  const add = () => {
    //notice in this context I must invoke the state to get the value (not in jsx)
    setCount(count() + 1)
    setCount2(count2() + 1)
  }

  // happens once
  console.log("Count non-effect", count())
  console.log("Count2 non-effect",count2())

  // happens when count updates
  createEffect(() => console.log("Count effect",count()))

  // JSX works like normal
  return (
    <div class="App">
      <h1>My Counter</h1>
      <h2>{count}</h2>
      <button onClick={add}>Add</button>
    </div>
  );
}

export default App;
```

The nice thing about this is updates are more granular making the need for the expense of a virtual dom unnecessary (only code that depends on the updated data will change without having to run any comparisons.)

## Bottom Line

Solid retains what is great about the React Syntax but also makes use of the performance-enhancing approaches of Svelte. I would not be surprised to see SolidJS grow in the same vein of Frameworks like Svelte and React!