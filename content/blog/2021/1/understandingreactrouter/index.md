---
title: Understanding React Router
date: "2021-01-15T12:12:03.284Z"
description: Learn the Pre-Hypertext Processor Language
---

## What is Routing?

Routing is just changing what the client is receiving in the web browser based on the endpoint of a URL. What's an endpoint.

Given this URL

```https://www.dummywebsite.net/someendpoint?first=something&second=somethingelse```

1. The Host

```https://www.dummywebsite.net```

2. The Endpoint/Path

```/someendpoint```

3. The Query String

```?first=something&second=somethingelse```

So when you hit enter in a browser the browser makes an HTTP request to the URL, sending a request to the sever designated by the host which then reads the endpoint and query and sends back a response, (this is what web frameworks like express, Rails, Django, etc. do for us).

In recent times people have embraced the single page application where instead of a bunch of different HTML files that are requested when you click on a link, that you create one large page that renders different content dynamically (frameworks like React, Vue, Angular and Svelte allow us to create such applications).

## Client-Side Routing

So when you have only one page, there is no need for additional routes from the web server, but users still prefer to have links they click on and URLs as they are accustomed to this experience. To solve this, client-side router libraries were created to simulate the behavior of traditional server-side routing. By monitoring the URL in the browser's URL bar, the router library tells the application which content to render.

React-Router is the client-side library for React.

## Setting Up React-Router

1. install react-router with npm

```npm install react-router react-router-dom```

2. In index.js wrap your App component with the router component, this component provides the rest of your application the data of the browser location (URL bar), so that all the other router components can work.

- import router

```import {BrowserRouter as Router} from "react-router-dom"```

- wrap the App component

```html
<Router>
    <App/>
</Router>
```

Now you can use all the React Router components in App and in any descendants of App.

## Route Component

The route component renders either a component or JSX if the browser location matches the specified path/endpoint. 

First you must import Route

```js
import {Route} from "react-router-dom"
```

There are three ways to write a route.

1. This is the easiest way, and you can pass custom props to the component but it will not receive the router props for grabbing params or using the history.push function.

```jsx
// Route will render its children if the path matches
<Route path="/someendpoint">
    <Component prop1="something"/>
</Route>
```

2. This is also fairly straightforward. The component will get the router props but you'll be unable to pass it custom props.

```jsx

// Route will render the component passed via the component prop, passing it the router props when the path matches
<Route path="/someendpoint" component={Component}/>

```

3. This method is syntactically the hardest but allows for the router props and custom props to be passed to the JSX to be rendered.

```jsx

// Route will render the return value of the function passed in the render prop, passing the routerprops as an argument to that function. This occurs when the path matches.
<Route path="/someendpoint" render={(renderProps) => {
    return <Component {...renderProps} prop1="something">
}}/>

```

## Link and history.push

For the routes to work the browser's location has to change and using a tags would invoke a server request which may break router, so that's not an option. The Link component and the history.push function are both ways to change the browser's location for your routes to respond to.

### Link

First, you must import the Link component

```js
import {Link} from "react-router-dom"
```

Then just wrap whatever should trigger the link with the link tag

```jsx

<Link to="/someendpoint">
    <button>Click Me</button>
</Link>

```

### History.push

If the component has access to routerProps then it can use the history.push to change the URL, perfect for when a form is submitted and you want to push them to another page after submission.

```jsx

const Component = (props) => {

    // ref for grabbing the value of the input form (uncontrolled forms)
    const inputRef = React.useRef(null)

    // function for when form is submitted
    const handleSubmit = (event) => {
        // prevent form from refreshing the page
        event.preventDefault()
        // log the value of the input
        console.log(inputRef.current.value)
        // push user back to the main page
        props.history.push("/")
    }
}


```

## Switch

The final router component is switch, what switch does is only render the first route within it that matches the current browser location.

```js
import {Switch} from "react-router-dom"
```

So assuming the following use of switch

```jsx
<Switch>
<Route path="/" render={(renderProps) => {
    return <MainPage {...renderProps} prop1="something">
}}/>
<Route path="/second" render={(renderProps) => {
    return <SecondPage {...renderProps} prop1="something">
}}/>
<Route path="/third" render={(renderProps) => {
    return <ThirdPage {...renderProps} prop1="something">
}}/>
</Switch>

```

Any URL will end up triggering the first route cause "/" is included in all possible endpoints (it does a soft match). So usually on root route ("/") it's a good idea to add the exact prop so it only appears when it is an exact match (don't add exact to all your routes cause it can prevent nested routes from working).

```jsx
<Switch>
<Route exact path="/" render={(renderProps) => {
    return <MainPage {...renderProps} prop1="something">
}}/>
<Route path="/second" render={(renderProps) => {
    return <SecondPage {...renderProps} prop1="something">
}}/>
<Route path="/third" render={(renderProps) => {
    return <ThirdPage {...renderProps} prop1="something">
}}/>
</Switch>

```

So now if the endpoint is...

/ => the MainPage component is rendered

/second => the SecondPage component is rendered

/third => the ThirdPage component is rendered

## URL Params

The Last feature of router I want to discuss is URL params, this is a way to designate a part of a URL as a variable to use as you see fit in components that have routerProps.

Given the following route:

```jsx
<Route path="/third/:myParam" render={(renderProps) => {
    return <ThirdPage {...renderProps} prop1="something">
}}/>
```

Any part of the URL preceded by a colon is treated as param by router. So if the browser's location becomes.

```/third/cheese```

The ThirdPage component will render cause it matches the Route page cause a param can take anything. Now in the components if we inspect the props we will find the string "cheese" in props.match.params.myParam.

match is a prop passed down from routerProps, inside of a match is an object called params where all URL params are stored. In the params object, we find a key for our myParam param where the value of it is stored, in this case, the value is "cheese". Params are a great way to take one route and use it for multiple use cases.

## Conclusion

Hopefully, this makes the usage of React Router clearer. There is more router can do so I encourage reading its documentation.