---
title: React Cheat Sheet
date: "2020-09-24T22:12:03.284Z"
description: Props, State, Forms, Classes, Functions
---

**MY SET OF REACT TUTORIAL VIDEOS** => https://www.youtube.com/playlist?list=PLY6oTPmKnKbba6LlpF7kcnsyWdlwePt_V

## Commands for starting a new React Project

CRA for production level apps `npx create-react-app projectname`

### Some alternatives:

Slim down version of CRA `npx create-react-basic projectname`

React using Parcel as a Bundler `npx merced-spinup react projectname`

React using Webpack as a Bundler `npx merced-spinup reactwebp projectname`

React using Rollup as a Bundler `npx merced-spinup reactrollup projectname`

React with Router setup `npx merced-spinup reactrouter projectname`

React with Redux setup `npx merced-spinup reactredux projectname`

React with useReducer setup `npx merced-spinup reactreducer projectname`

React with Typescript `npx merced-spinup reactts projectname`

React with Script Tags `npx merced-spinup reacthtml projectname`

Express using Express-React-Views `npx merced-spinup expressreact projectname`

Express/Mongo using Express-React-Views `npx create-ervmongo-app projectname`

---

** FOR ALL THE CODE BELOW, THE APPROPRIATE IMPORTS ARE IMPLIED, DON'T FORGET TO IMPORT WHAT YOU NEED **

## Writing Components

### Class Component

```js
class MyComponent extends React.Component {
  constructor(props) {
    super(props)
  }

  render() {
    return <h1>Hello World</h1>
  }
}
```

### Functional Component

```js

const MyComponent = (props) => <h1>Hello World</h1>

//////////////////////////////////////////

const MyComponent = function(props){
  return <h1>Hello World</h1>
}

////////////////////////////////////////////

function MyComponent(props){
  return <h1> Hello World <h1>
}
```

## Using Props

### Class Components

```js
;<MyComponent myProp="Hello World" />

/////////////////////////////////////////////

class MyComponent extends React.Component {
  constructor(props) {
    super(props)
  }

  render() {
    return <h1>{this.props.myProp}</h1>
  }
}
```

### Function Components

```js
;<MyComponent myProp="Hello World" />

/////////////////////////////////////////////

const MyComponent = props => <h1>{props.myProp}</h1>
```

## Using State

### Class Components

```js
class MyComponent extends React.Component {
  constructor(props) {
    super(props)
    this.state = {
      count: 0,
    }
  }

  render() {
    return (
      <div>
        <h1>{this.state.count}</h1>
        <button
          onClick={event => this.setState({ count: this.state.count + 1 })}
        >
          Click Me
        </button>
      </div>
    )
  }
}
```

### Function Components

```js
const MyComponent = props => {
  const [count, setCount] = React.useState(0)

  return (
    <div>
      <h1>{count}</h1>
      <button onClick={event => setCount(count + 1)}>Click Me</button>
    </div>
  )
}
```

## Lifecycle

### Class Components

```js
class MyComponent extends React.Component {
  constructor(props) {
    super(props)
  }

  render() {
    return <h1>{this.props.myProp}</h1>
  }

  componentDidMount() {
    console.log("I happen when the component first mounts")
  }

  componentDidUpdate() {
    console.log("I happen when the component updates")
  }

  componentWillUnmount() {
    console.log("I happen before the component is removed")
  }
}
```

### Function Components

```js
const MyComponent = props => {
  React.useEffect(() => {
    console.log(
      "I happen when the component first mounts or when any value in the dependency array changes"
    )

    return () => console.log("I run when the component is removed")
  }, [dependency1, dependency2])

  return <h1> Hello World </h1>
}
```

## Handling Forms

### Class Components

```js
class MyComponent extends React.Component {
  constructor(props) {
    super(props)

    this.state({
      textfield: ""
    })

    this.handleChange.bind(this)
    this.handleSubmit.bind(this)
  }

  handleChange(event){
    this.setState({[current.target.name]: current.target.value})
  }

  handleSubmit(event){
    console.log("lets take a look at the form data in our state")
    console.log(this.state)
  }

  render() {
    return (<form onSubmit={this.handleSubmit}>
    <input type="text" name="textfield" value={this.state.textfield} onChange={this.handleChange}>
    <input type="submit" value="submit">
    </form>)
  }

}
```

### Function Components

```js
const MyComponent = props => {

  const [formData, setFormData] = React.useState({
    textfield: ""
  })

  const handleChange = (event) => {
    setState({[current.target.name]: current.target.value})
  }

  const handleSubmit = (event) => {
    console.log("lets take a look at the form data in our state")
    console.log(formData)
  }

  return (<form onSubmit={handleSubmit}>
    <input type="text" name="textfield" value={this.state.textfield} onChange={handleChange}>
    <input type="submit" value="submit">
    </form>)
}
```

## Rules of JSX

- Only one parent element, the work around is to use fragments

`return <><h1>Hello</h1><h2>world</h2></>`

- to add a class to an element use className, not class

`<h1 className="heading">Hello World</h1>`

- Event names are camelCase

`<button onClick={eventHandler}>Click Me</button>`

- No open tags, so even tags that normally don't need to be closed, must close.

`<img/> <input/> <MyComponent/>`

- Anything wrapped by a component becomes a prop accessed by props.children

`<Component> <h1> I am now accessed via props.children </h1> </Component>`

- inLine styling is achieved by passing an object where the properties are keys in camelcase with values.

`<h1 style={{color: "red", display: "flex", backgroundColor: "white"}}>Hello</h1>`

## React Function Component Hooks

Read my hooks article here: https://tuts.alexmercedcoder.dev/2020/reacthooks/
