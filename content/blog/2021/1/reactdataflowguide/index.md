---
title: React Data Flow - Understanding State and Props
date: "2021-01-15T12:12:03.284Z"
description: Learn the Pre-Hypertext Processor Language
---

## What is the VirtualDOM

One of the key innovations in the React library is the idea of a virtualDOM. Whenever triggered React creates a virtual rebuild of your application and compares it to the real state of your application (the real DOM) and updates only the parts that are different speed up the updates since it isn't rebuilding parts that haven't changed. So when these changes are triggered it is known as a render.

## What triggers a render

The reason you use the setState function instead of modifying the state directly is because the setState isn't changing the current state but instead triggering a new render using the new state as the state of the component in the virtual render for comparison. Once the render is triggered it begins to compare to see if an update is necessary.

First, it compares the component where the state is initially changed, if not identical it will be updated. It then examines children of that component and whether their props have changed between renders (if so, those components also get an update) and so forth.

## Data between Components

Every component is part of the component tree typically with your App component at the top. Any components that App renders in its JSX are its children and so forth. A component can't receive data from its siblings or children so how would data move around, here are some scenarios.

### To Child From Parent

The Parent passes the data to its child as a prop

### To Parent from Child

Parents have state to hold the data and sends the child the setState function nested in another function. The child then passes the data to this function to update the state in the parent.

### From Sibling to Sibling

Since siblings can't send data to each other trick is to use a shared parent (this is also known as lifting state.)

- **For the Sibling Sending Data:** In the shared parent state is created to hold the information and a function to set that state is passed down as props to the sending component.

- **For the Sibling Receiving Data:** Once the shared parents' state has been updated the parent passes down that state as props to the receiving component.

## Prop Drilling

As if sending data to a great-grandchild the following would have to occur...

- Parent sends props to Child
- Child sends props to Grandchild
- Grandchild sends props to GreatGrandChild

This can be quite tedious and annoying to refactor later, this is called props drilling.

## Context

Using context we can send data to deeply nested components with ease and avoid prop drilling. Using the React.createContext function we create an instance of context which creates two components, a Provider and Consumer.

The Provider component has a value prop, any data passed in via the value prop becomes available to all of the provider's descendants (potentially your whole application if you make the App component a child.) In the components receiving the data, you can use the Consumer component or the useContext hook to pull the data from the value prop without having to pass the data as props to intermediate components.

## The Cost of Context

The cost of using Context or some other state management tools is the components become no longer reusable in other projects. So if you are making a button or carousel component you'd like to use in future projects it should receive all data as props, and instead make a non-reusable component as its parent to pull data from context and pass down as a prop. Think of them as "Junction" components, components that exist at deeper levels in the component tree to pull info from context and pass them as props to components that need them at lower levels of the component tree.

## In Conclusion

Hope this helps explain how to handle data in your react app in different scenarios. For even more advanced state management consider the following.

- Using the createTaskRunner or createDataStore features from my custom hooks library, merced-react-hooks

- Use the useReducer hook with the useContext hook to centralize state and application logic

- Use a library like redux to centralize state and application logic