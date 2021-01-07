---
title: 5 Cool Things You Can Do In React
date: "2021-01-07T12:12:03.284Z"
description: Cool React Tips
---

## 1 - Spreading Props

Sometimes your tags can get a little messy listing several props like this...

```js

const Component = (props) => {

  return <Child firstProp={1} secondProp={"cheese"}>
}

```

This can be simplified by creating an object with all your props and using the spread operator to programmatically add them individually to the child component.

```js

const Component = (props) => {

  const childProps = {
    firstProp: 1,
    secondProp: "cheese"
  }

  return <Child {...childProps}>
}

```

This does the same thing as the prior snippet but your JSX looks cleaner.

## 2 - Destructuring Your Props

Typing props over and over like this can be really tedious...

```js
const Component = props => {
  return (
    <div>
      <h1>{props.firstProp}</h1>
      <h2>{props.secondProp}</h2>
    </div>
  )
}
```

You can use object destructuring to simplify this.

```js
const Component = props => {
  const { firstProp, secondProp } = props

  return (
    <div>
      <h1>{firstProp}</h1>
      <h2>{secondProp}</h2>
    </div>
  )
}
```

Even better we can destructure props in the parameter definition...

```js
const Component = ({ firstProp, secondProp }) => {
  return (
    <div>
      <h1>{firstProp}</h1>
      <h2>{secondProp}</h2>
    </div>
  )
}
```

Now I never had to type the word props! Even better we can take advantage of destructuring syntax to give default values to the different props.

```js
const Component = ({ firstProp = 1, secondProp = "cheese" }) => {
  return (
    <div>
      <h1>{firstProp}</h1>
      <h2>{secondProp}</h2>
    </div>
  )
}
```

## Render Functions

Conditional Rendering can be a very tedious and necessary part of life in React world and the result can make your code tricky to read with all the ternary operators like this.

```js
const Component = props => {
  return props.dataArray != undefined ? (
    <h1>The Data Exists</h1>
  ) : (
    <h1>The Data Doesn't Exist</h1>
  )
}
```

This works but as your JSX gets longer and more complex this can a bit tricky to read, so bundling your output into functions that render JSX can help clean this up.

```js
const Component = props => {
  const loaded = () => <h1>The Data Exists</h1>

  const loading = () => <h1>The Data Doesn't Exist</h1>

  return props.dataArray != undefined ? loaded() : loading()
}
```

This is certainly a little easier to read, and if you don't like ternary operators can be restated as:

```js
const Component = props => {
  const loaded = () => <h1>The Data Exists</h1>

  const loading = () => <h1>The Data Doesn't Exist</h1>

  if (props.dataArray != undefined) {
    loaded()
  } else {
    loading()
  }
}
```

## 4 - JSX Props

By default, props includes props.children which renders any children in a particular spot of your JSX.

```js

const Child = (props) => {
  return <div>
    <header></header>
    <main>{props.children}</main>
    <footer></footer>
  </div>
}

const Parent = props => {
  return <Child>
  <h1>Hello World</h1>
  </Child>
}

```

So the h1 with "Hello World" will render within the main tag in child cause that is where we determined any "children" of Child should appear. What if you wanted other code to appear elsewhere like the header and footer. Unfortunately, unlike Vue, Angular, Svelte, and Web Components you don't have slots and named slots for doing such a thing. Instead, you can use props like so:

```js

const Child = (props) => {
  return <div>
    <header>{props.header}</header>
    <main>{props.children}</main>
    <footer>{props.footer}</footer>
  </div>
}

const Parent = props => {
  return <Child header={<h1>I am the Header</h1>} footer={<h1> I am the Footer </h1>}>
  <h1>Hello World</h1>
  </Child>
}

```

This works but maybe this would look cleaner if we used our previous props object trick and destructured our props to clean up the child.

```js

const Child = ({header, children, footer}) => {
  return <div>
    <header>{header}</header>
    <main>{children}</main>
    <footer>{footer}</footer>
  </div>
}

const Parent = props => {

  const childProps = {
    header: <h1>I am the Header</h1>,
    footer: <h1> I am the Footer </h1>
  }

  return <Child {...childProps}>
  <h1>Hello World</h1>
  </Child>
}

```

## 5 - Creating Custom Hooks

You can create your own custom hooks to use in your code. They should just start with the word used and can only be invoked in the body of a component. Here is a quick and dirty example of a useFetch hook for getting API data and updating it.

```js

const useFetch = (url, initialValue) => {
  // The State to Hold our API Data
  const [state, setState] = React.useState(initialValue)

  // function to fetch data and store into state
  const getData = async () => {
    const response = await fetch(url)
    const data = await response.json()
    setState(data)
  }

  // Initial Fetch
  getData()

  // return state and function to fetch
  return [state, getData]
}

// Now this hook can be used in a component

const Component = (props) => {
  const [APIData, refetch] = useFetch("http://api.com/endpoint")

  return <h1>Hello World</h1>
}

```

So all a custom hook is a function that handles a lot of the logic with built-in hooks so you don't have to rewrite it all the time. Once again, the big caveat is since those native hooks must be used in the body of a function component, so does your custom hook.