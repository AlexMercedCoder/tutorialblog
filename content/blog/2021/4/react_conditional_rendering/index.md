---
title: React Conditional Rendering
date: "2021-04-21T12:12:03.284Z"
description: React for Everyone
---

[My React Breakdown 2021 Github Gist](https://gist.github.com/AlexMercedCoder/b4d86790176f2f5c7b374235cf3dc23c)

## What is conditional rendering

There are times when something should render in some situations and not in others. In frameworks like Vue, Angular and Svelte you have things like directives that directly add semantic ways to express this, React leans hard on using pure javascript to control the flow of a component (so strong Javascript skills really pay off in React).

In this article, we will look at an IsEven component that renders one thing if a prop is even and another it isn't. We'll show you different ways of express it.

## Return statement within an if block

```jsx
const IsEven = props => {
  if (props.number % 2 === 0) {
    return <h1> It is even </h1>
  } else {
    return <h1>It is odd</h1>
  }
}
```

## Single Return Statement, If assigns value to a variable

```jsx
const IsEven = props => {
  let result

  if (props.number % 2 === 0) {
    result = <h1> It is even </h1>
  } else {
    result = <h1>It is odd</h1>
  }

  return result
}
```

## Returning a Ternary Operator

```jsx
const IsEven = props => {
  return props.number % 2 === 0 ? <h1> it is even </h1> : <h1> it is odd </h1>
}
```

## Returning a Ternary Operator but parts stored in variables

```jsx
const IsEven = props => {
  const condition = props.number % 2 === 0

  const ifTrue = () => <h1> it is even </h1>

  const ifFalse = () => <h1> it is odd </h1>

  return condition ? ifTrue() : ifFalse()
}
```

## Conditional Classes

```jsx
const Modal = props => (
  <div className={props.visible ? "active" : ""}>{props.children}</div>
)
```

```jsx
const Modal = props => {
  const divClass = props.visible ? "active" : ""

  return <div className={divClass}>{props.children}</div>
}
```

## Conditional Styles

```jsx
const Modal = props => (
  <div style={{ display: props.visible ? "block" : "none" }}>
    {props.children}
  </div>
)
```

```jsx
const Modal = props => {
  const divDisplay = props.visible ? "block" : "none"

  return <div style={{ display: divDisplay }}>{props.children}</div>
}
```

```jsx
const Modal = props => {
  const divStyle = {
    display: props.visible ? "block" : "none",
  }

  return <div style={divStyle}>{props.children}</div>
}
```

## Using Object Keys to Determine JSX

```jsx
const Component = props => {
  const result = {
    good: <h1>Good</h1>,
    bad: <h1>Bad</h1>,
    ugly: <h1>Ugly</h1>,
  }

  return result[props.key]
}
```

## Using a Switch Statement

```jsx
const Hello = (props) => {
  switch(props.language){
    case "eng":
      return <h1>Hello</h1>
    case "esp":
      return <h1>Hola</h1>
    default:
      return: <h1> No Language Detected </h1>
  }
}
```
