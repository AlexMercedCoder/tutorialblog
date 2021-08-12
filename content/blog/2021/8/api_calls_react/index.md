---
title: 3 Ways to make API Requests in React (fetch/axios, merced-react-hooks, react-request)
date: "2021-08-12T12:12:03.284Z"
description: Getting Data from an external API
---

When working with React there are several things that can be particularly annoying to deal with...

- controlled forms (solutions: formik, merced-react-hooks)
- asynchronous requests (solutions: react-request, merced-react-hooks)
- mapping over data (solutions: merced-react-hooks)
- synching your state with local or session storage (solutions: merced-react-hooks)
- state management (solutions: redux, mobx, recoil, merced-react-hooks)

In this article we will deal with asynchronous requests and give several snippets of code making an api call using different tools. 

## No Special Hooks or Components (Fetch or Axios)

Of course there is everyone's two favorite standard ways of making http requests in javascript. The native browser fetch API and the 3rd party Axios library. Below is a snippet of showing both of these at work. First,  a little commentary:

- You want to have state to save your api response in, so this way when you get the data it triggers an update of your ui

- Your JSX is using the data from state, but on the very first render before the request has completed that data won't exist so you'll need some conditional logic (ternarys, optional chaining, if statements) to make sure you don't try to access it till it is available.

- In my snippets I'll initiate the state as null so the state is falsey until there is data.

- We make the api call in a useEffect so it occurs when the component is mounted without creating an infinite loop.

#### Fetch

```js
import React, { useState, useEffect } from 'react'
import './App.css'

function App() {
  // State to Save API Data
  const [apiData, setApiData] = useState(null)

  // useEffect runs when component mounts and sets the state when request completes
  useEffect(() => {
    fetch("https://jsonplaceholder.typicode.com/posts")
    .then(res => res.json())
    .then(data => setApiData(data))
  }, [])

  console.log(apiData)

  return (
    <div className="App">
      {/* use ternary to see if data exists, only map over array if exists, otherwise null */}
      {apiData ? apiData.map(item => <h1 key={item.id}>{item.title}</h1>) : null}
    </div>
  )
}

export default App
```

#### Axios 

`npm install axios`

```js
import React, { useState, useEffect } from 'react'
import axios from "axios"
import './App.css'

function App() {
  // State to Save API Data
  const [apiData, setApiData] = useState(null)

  // useEffect runs when component mouths and sets the state when request completes
  useEffect(() => {
    axios("https://jsonplaceholder.typicode.com/posts")
    .then(data => setApiData(data.data))
  }, [])

  console.log(apiData)

  return (
    <div className="App">
      {/* use ternary to see if data exists, only map over array if exists, otherwise null */}
      {apiData ? apiData.map(item => <h1 key={item.id}>{item.title}</h1>) : null}
    </div>
  )
}

export default App
```

## merced-react-hooks

merced-react-hooks is a library of custom hooks and components I've created with lots of great tools to make lots of things easier.

- custom hooks for fetch requests, working with forms, global state management, binding state to local or session storage, and more semantic lifecycle hooks
- custom components for mapping over data and writing conditional ui

In the example below I use the useFetch hook from the library which returns the state a "refetch" function for repeating the request when needed.

```js
import React, { useState, useEffect } from 'react'
import {useFetch} from "merced-react-hooks"
import './App.css'

function App() {
  // State to Save API Data, refetch function used if data needs to be refetched
  const [apiData, refetch] = useFetch("https://jsonplaceholder.typicode.com/posts")

  console.log(apiData)

  return (
    <div className="App">
      {/* use ternary to see if data exists, only map over array if exists, otherwise null */}
      {apiData ? apiData.map(item => <h1 key={item.id}>{item.title}</h1>) : null}
    </div>
  )
}

export default App
```
* Note the useFetch hook takes a second argument to customize the fetch method, body, headers, etc. It works exactly like the second argument to the fetch function.

## react-request

react-request has been gaining a lot of popularity very quickly. In this library you use a special fetch component and pass a function with your ui logic as a child.

`npm install react-request`

```js
import React from "react"
import {Fetch} from "react-request"
import './App.css'

function App() {

  return (
    <div className="App">
      <Fetch url="https://jsonplaceholder.typicode.com/posts">

        {({fetching, failed, data}) => {
          // what to render if request failed
          if (failed) return <h1>Request Failed</h1>
          // What to render if request still pending
          if (fetching) return <h1>Still Loading</h1>
          // What to render when data is available
          if (data) return data.map(item => <h1 key={item.id}>{item.title}</h1>)
        }}

      </Fetch>
    </div>
  )
}

export default App
```

### Conclusion

Whichever method you use hopefully this gives you clarity on how you can make your API requests in React.