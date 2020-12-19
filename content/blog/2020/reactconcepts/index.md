---
title: React in Concept - The Terms and Idea
date: "2020-09-24T22:12:03.284Z"
description: Props, State, Forms, Classes, Functions
---

**MY SET OF REACT TUTORIAL VIDEOS** => https://www.youtube.com/playlist?list=PLY6oTPmKnKbba6LlpF7kcnsyWdlwePt_V

## What is React

React is a frontend UI library. The purpose of this library is to help in creating frontend applications. Some of the benefits of React are...

- Encapsulation: By building pieces of your UI/UX in the form of components, you create potentially reusable piece that can reduce the overall code of your project and in turn reduce bugs and improve modularity.

- Reactive Data: React with the use of state and the virtual dom is able to monitor for changes in your application "state" and update the UI which is nice versus something like jQuery where you would have to write out the logic to update the DOM when necessary.

## State vs Props

While you'll also have standard variables, much of the data in your components will fall into one of two categories, state or props.

One way to think of this, is to think of yourself as a ```<Human/>``` component. Your state are things you know internally, no one has to tell you things like your name, feelings or opinions, that is internal knowledge. If your state changes, your external actions immediately change. If you feel sad you may have a new frown on your face, or if your opinions change you may vote or act differently. So when your state changes, what others experience from you changes too. This is how state works in react, when state changes the component updates which typically but not always have visual effects.

On the other hand, some knowledge you get externally. For example the weather forecast is given to you by the News, once you are aware of the forecast you may change your state (your opinion on what to wear) and thus your behavior changes depending on the forecast but you don't control what the forecast will be, an external force is giving you this and your state changes internally. 

This is the concept of props, which is information that comes externally to a component usually from its parent. 

**NOTE**: Credit to Joe Keohan where I first heard state compared to emotions.

```<Human forecast="sunny"/>```

So all data coming to your component will be state (internal) or props (external).




## Lifecycle

Lifecycle is essentially saying that certain things should always happen at certain points. For example, for our ```<Human/>``` component when it is created it should be given a birth certificate and has a birthday everytime it's a year older. When the component is removed it gets a death certificate. The lifecycle of a component is that it mounts, updates and is removed from the DOM. We can could write out lifecycle for our human component as such...

```js
React.useEffect(() => {
  console.log("You are born, you get a birth certificate")

  return () => console.log("you have died, you get a death certificate")
}, [])

React.useEffect(() => {
  console.log("Happy Birthday")
}, [age])

```

## Context

Imagine your application is a building with floors. At the top floor we have our ```<App/>``` and as a child we have ```<Floor80/>``` and then ```<Floor79/>``` and so on. You have a piece of data you want to take down to Floor 1. By default your only options is the stairwell which means you have to walk down to floor 80, then floor 79, floor 78, etc. Essentially this is the process of passing props to one component, then that component passing that data as props to its children and so forth.

Using the React Context API is like building an elevator into your building. Instead of having to walk down each floor we can take the Context elevator and zip on down to Floor 1.