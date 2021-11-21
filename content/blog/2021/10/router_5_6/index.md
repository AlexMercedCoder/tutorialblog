---
title: Comparing React Router 5, 6, and React Location
date: "2021-10-21T12:12:03.284Z"
description: For simple web development
---
![Comparing React Router 5, 6, and React Location](https://i.imgur.com/YxqmEmR.jpg)

Recently React Router released version 6 which created a lot of confusion as several aspects of its API are quite different. Also, Tanstack released React-Location, an entrant to React Routing space from the creators of beloved libraries like React-Query, React-Table, React-Charts, etc. So let's see how we'd install and do common routing tasks with all three.

- [Video for React Router 5](https://www.youtube.com/watch?v=UOh4WzovSpQ&t=19s)
- [Video for React Router 6](https://www.youtube.com/watch?v=FGP-4cunITM)

## Installing

- React Router 5: `npm install react-router-dom@5.3.0`
- React Router 6+: `npm install react-router-dom`
- React Location: `npm install react-location`

## Setup

- React Router 5/6 have the same setup, you'll want to wrap the entire application in the BrowserRouter component which we will rename router for convenience. 

```js
import React from "react";
import ReactDOM from "react-dom";
import "./index.css";
import App from "./App";
import {BrowserRouter as Router} from "react-router-dom"
import reportWebVitals from "./reportWebVitals";

ReactDOM.render(
  <React.StrictMode>
    <Router>
      <App />
    </Router>
  </React.StrictMode>,
  document.getElementById("root")
);
```

- React Location does require you set up a few pieces up front

1. Create a src/location.js file

```js
import {ReactLocation} from "react-location"
import AboutPage from "./pages/About"
import HomePage from "./pages/Home"

// create a location object
export const location = new ReactLocation()

// create a routes object
export const routes = [
    { path: "/", element: <HomePage /> },
    { path: "/about", element: <AboutPage/>}
  ]
```

2. Wrap the application with Router

```js
import React from "react";
import ReactDOM from "react-dom";
import "./index.css";
import App from "./App";
import reportWebVitals from "./reportWebVitals";
import { Router } from "react-location";
import { location, routes } from "./location";

ReactDOM.render(
  <Router location={location} routes={routes}>
    <React.StrictMode>
      <App />
    </React.StrictMode>
  </Router>,
  document.getElementById("root")
);

// If you want to start measuring performance in your app, pass a function
// to log results (for example: reportWebVitals(console.log))
// or send to an analytics endpoint. Learn more: https://bit.ly/CRA-vitals
reportWebVitals();
```

## Setting Up Routes

- React Router 5, it was a little confusion as you had THREE ways to define your routes. You'd typically wrap your routes with a Switch component to limit it to one active route at a time. Routes looked for soft matches for "/cats" would match "/", "/c", "/ca", "/cat" and "/cats" to prevent this you'd have to use an "exact" prop.

1. Using the component prop which auto passed location and match as props to the route, but no way to pass custom props.

```js
<Switch>
    <Route path="/about" component={About}/>
</Swich>
```

1. You could pass the JSX to be rendered as the child of route, but then there was no way to pass location and match as a prop, but you could pass your own custom props.

```js
<Switch>
    <Route path="/about">
        <About/>
    </Route>
</Swich>
```

1. Using the render prop which would take a function that would return what is to be rendered. This function was given an object with the Router Props which we can use along with passing custom props. This worked... but confusing.

```js
<Switch>
    <Route path="/about" render={(routerProps) => <About {...routerProps}/>}/>
</Swich>
```



- React Router 6 Simplified this quite a bit replacing Switch with a mandatory "Routes" component which could take routes which only had an element prop which only did hard matches by default (if you needed softer matching you'd have to use the wildcard charachter "*"). These could be passed custom props and objects like location and match would instead be accessed using custom hooks.

```js
<Routes>
   <Route path="/about" element={<About/>}>
<Routes>
```

- Routes in react-location are all defined in the routes array we created in location.js

```js
// create a routes object
export const routes = [
    { path: "/", element: <HomePage /> },
    { path: "/about", element: <AboutPage/>}
  ]
```

the defined routes will appear wherever you place the Outlet component

```js
import {Outlet} from "react-location"

function App() {
  return (
    <div className="App">
      <Outlet/>
    </div>
  );
}

export default App;
```

## Accessing URL Params

In all three scenarios, params are part of the url marked with colons `/about/:person` which gets saved in a variable of the same name. How to access the param can differ.

#### React Router 5

In order to get the param you need access to the match prop which will only exist in the component if the route using the "component" or "render" prop form. So using the above url path as an example. We can then retreive the param from props like so.

```js
const person = props.match.params.person
```

#### React Router 6

We can just use the useParams hook to get the params object and grab what we need.

```js
import {useParams} from "react-router-dom"
```

```js
const params = useParams()
const person = params.person
```

#### React Location

This is similar to react router 6, you can get the match object using the useMatch hook and pull params from there.

```js 
import {useMatch} from "react-location"
```

```js
    const match = useMatch()
    const params = match.params
    const person = params.person
```

## Redirect to other Pages

All three scenarios can use a `<Link>` component to link from one route to another, but what happens when you want to redirect from inside a function?

#### React Router 5

This would need the router props meaning you need to use the "component" or "render" prop route forms, and the function to redirect the user to a different route would be `props.history.push("/")`

#### React Router 6 & React Location

You just use the useNavigate hook to pull in the navigate function then redirect.

```js
import {useNavigate} from "..."
```

```js
const navigate = useNavigate()
```

```js
navigate("/")
```

## Conclusion

Hopefully this helps show you the many options you have for routing with React, but of course you can always use Gatsby or NextJS and take advantage of file-based routing with React!