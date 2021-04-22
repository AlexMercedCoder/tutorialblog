---
title: The Basics of React Testing With Jest
date: "2021-04-22T12:12:03.284Z"
description: Making Sure React Works
---

[MY VIDEO ON REACT TESTING](https://youtu.be/Qpp67fEqtxo)
## Why Testing Matters

While we can test our own code in our local environment it can get tedious replicating every piece of functionality and every edge case for every change we make. This results in shipping code with errors. These errors fall into several categories.

- Syntax Errors: We didn't write the right thing, this could be caught by a Linting tool.

- Type Errors: We passed the wrong type of data to a function (like "1" instead of 1 or "true" instead of true) so while the code may be correct it behaves unpredictably. These are the worst, but luckily, transpiled languages like Typescript and Reason have typing to make catching this easier.

- Logic Errors: The code is written fine, everything is passed and returns the right types... the logic just doesn't do what we want it to do. Linting and Typing won't catch this... this requires tests.

## Thinking as a Tester

Writing a test is simple as saying "If x, I expect y". The art is determining what should be tested...

- If my application is used correctly by the end-user, what do I expect?
- If my application is used incorrectly by the end-user, what do I expect?
- What are all the ways my user can potentially break my app.

By asking the question above you can quickly create a list of scenarios that should be tested.

## Let's try it out!

- generate a React project `npx create-react-app testingpractice`

**NOTE** If using a non-CRA React generator read [this guide](https://jestjs.io/docs/tutorial-react) on setting up Jest for React.

- Head over to App.js and let's write a basic counter that decrements and increments

```jsx
import { useState } from "react";
import "./App.css";

function App() {
  //the state
  const [counter, setCounter] = useState(0);
  return (
    <div className="App">
      <h1>{counter}</h1>
      <button onClick={() => setCounter(counter + 1)}>+1</button>
      <button onClick={() => setCounter(counter - 1)}>-1</button>
    </div>
  );
}

export default App;
```

## Our First Test

The main thing about this component that needs testing, is the counter so we will create a test called "testing the counter exists".

App.test.js
```js
import { render, screen } from '@testing-library/react';
import App from './App';

test("testing the counter exists", () => {
  // First we should render the component we are testing
  render(<App />);
  // we will grab the h1 and buttons
  const h1 = screen.getByText("0");
  // does the h1 exist?
  expect(h1).toBeInTheDocument();
});
```

We assume after the component is rendered there will be an h1 that says 0, so we search the screen for an element with the text of 0 and assert that we expect it to be there.

run `npm run test`

The test should pass!

## More Tests

Other Things we should test for...

- if the +1 button is pushed does the number increase

```js
test("testing the +1 button", () => {
  // First we should render the component we are testing
  render(<App />);
  // TESTING THE +1 Button
  const plusbutton = screen.getByText("+1");
  // Clickin on the +1 button
  fireEvent.click(plusbutton);
  // test the h1 has changed
  const h1plus = screen.getByText("1");
  expect(h1plus).toBeInTheDocument();
});
```


- the -1 button is pushed does the number decrease

```js
test("testing the -1 button", () => {
  // First we should render the component we are testing
  render(<App />);
  // TESTING THE -1 Button
  const minusbutton = screen.getByText("-1");
  // Clickin on the -1 button
  fireEvent.click(minusbutton);
  // test the h1 has changed
  const h1minus = screen.getByText("-1", {selector: "h1"});
  expect(h1minus).toBeInTheDocument();
});
```

Notice in this last test I had to specify the selector and this is causing the number "-1" would match the button text of "-1" causing the test to fail.

## The Full Code

```js
import { fireEvent, render, screen } from "@testing-library/react";
import App from "./App";

test("testing the counter exists", () => {
  // First we should render the component we are testing
  render(<App />);
  // we will grab the h1 and buttons
  const h1 = screen.getByText("0");
  // does the h1 exist?
  expect(h1).toBeInTheDocument();
});

test("testing the +1 button", () => {
  // First we should render the component we are testing
  render(<App />);
  // TESTING THE +1 Button
  const plusbutton = screen.getByText("+1");
  // Clickin on the +1 button
  fireEvent.click(plusbutton);
  // test the h1 has changed
  const h1plus = screen.getByText("1");
  expect(h1plus).toBeInTheDocument();
});

test("testing the -1 button", () => {
  // First we should render the component we are testing
  render(<App />);
  // TESTING THE -1 Button
  const minusbutton = screen.getByText("-1");
  // Clickin on the -1 button
  fireEvent.click(minusbutton);
  // test the h1 has changed
  const h1minus = screen.getByText("-1", {selector: "h1"});
  expect(h1minus).toBeInTheDocument();
});
```

## In Summary

The main thing isn't the code of the test but the purpose of the test. Always be asking yourself what is the purpose of what you are testing and how it can be broken and you'll know what to test for. Now that these tests are written if I modify that counter code I can quickly determine if the counter logic still works, nice!

There's a lot of possible ways to write tests, so make sure to read through [this documentation](https://testing-library.com/docs/) to learn more possible ways to write tests.