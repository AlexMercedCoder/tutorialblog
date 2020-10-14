---
title: npx create-react-loaded supercharged react
date: "2020-10-14T22:12:03.284Z"
description: Router, GlobalState, Sass and more!
---

## Array Callback Methods

So you may be aware I've made a huge amount of templates across several frameworks using my merced-spinup tool, but for certain templates I give them their own tool cause I expect many want to use them.

For react I have create a tool for a very basic build that you can customize that comes in at half the size of create-react-app, the commands for this build are.

```
npx create-react-basic folderName
```

```
npx merced-spinup reactbasic folderName
```

Today I'm looking to discuss a new template I made with a more robust set of tools out of the box. The commands for this React template are as follows.

```
npx create-react-loaded folderName
```

```
npx merced-spinup reactloaded folderName
```

## React Loaded Features

### Sass

You have the ability to use sass files for styling, there is already a global sass style sheet in the src folder.

### Router

Router is installed and a couple sample pages in a pages folder.

### GlobalState

A custom components and hook was made to make global state management even easier. In the gstate.js file you can alter the initialState and the reducer.

In the app.js file, the GlobalState component which wraps the App components provides the state object and dispatch function to the entire application.

import the useGlobal hook from gstate.js into any file to easily pull the state and dispatch into that component.

### Custom Hooks

In customHooks.js there are a couple of custom hooks.

**useFetch:** Pass the url you want to fetch and it returns an array with the data from the fetch and a setUrl function. Everytime you use the setUrl function it will remake the API call and update the data.

**useAdjuster:** takes a starting a value and an interval. Returns and array with the value and two functions that will increment and decrement the value by that interval.

### Pre-made Components

In utility.js there are several premade components that customizable externally and you can customize in the file for Buttons, Modals, Carousels, Containers, FlexContainers, and Cards. All of these should be running on the default page as an example. There is also a pre-made header and footer component.

## Bottom Line

Using the create-react-loaded supercharges with lots of customizable pre-configured tools to get you up and running in building your React app.
