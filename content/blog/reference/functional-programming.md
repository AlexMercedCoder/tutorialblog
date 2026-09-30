---
title: "Functional Programming"
date: "2023-10-21T23:27:29-04:00"
description: "Functional programming is a programming paradigm that treats computation as the evaluation of mathematical functions and avoids changing state and mutable data."
author: "Alex Merced"
tags:
  - reference
---
> This reference guide moved here from DataLakehouse.help, which now focuses on lakehouse procedures.

## Functional Programming Techniques
Functional programming is a programming paradigm that treats computation as the evaluation of mathematical functions and avoids changing state and mutable data. It focuses on immutability, pure functions, and composition to build more predictable and maintainable software.

### 1. Pure Functions
Pure functions are functions that always produce the same output for the same input and have no side effects. They don't modify variables outside their scope or perform actions that are observable to the outside world.

Example in JavaScript:

```js
// Pure function
function add(a, b) {
  return a + b;
}

const result = add(3, 5); // Always returns 8
```

### 2. Immutability
Immutability is the practice of not modifying data after it's created. In functional programming, data is treated as immutable, and new data is created when changes are needed.

Example in JavaScript:

```js
const numbers = [1, 2, 3];

// Immutably adding an element to the array
const newNumbers = [...numbers, 4]; // [1, 2, 3, 4]
```

### 3. Function Composition
Function composition is the process of combining simple functions to build more complex functions. It's a fundamental concept in functional programming.

Example in JavaScript:

```js
// Function composition
const compose = (f, g) => (x) => f(g(x));

const addOne = (x) => x + 1;
const double = (x) => x * 2;

const addOneAndDouble = compose(double, addOne);

console.log(addOneAndDouble(5)); // 12
```

### 4. Currying
Currying is a technique where a function that takes multiple arguments is transformed into a series of functions that each take a single argument. It allows for partial function application.

Example in JavaScript:

```js
// Curried function
const curriedAdd = (a) => (b) => a + b;

const addFive = curriedAdd(5);
console.log(addFive(3)); // 8
```

### 5. Memoization
Memoization is a caching technique used to optimize expensive function calls by storing their results and returning the cached result when the same inputs occur again.

Example in JavaScript:

```js
// Memoization using a cache
const memoize = (func) => {
  const cache = {};
  return (...args) => {
    const key = JSON.stringify(args);
    if (cache[key]) {
      return cache[key];
    }
    const result = func(...args);
    cache[key] = result;
    return result;
  };
};

const fibonacci = memoize((n) => {
  if (n <= 1) return n;
  return fibonacci(n - 1) + fibonacci(n - 2);
});

console.log(fibonacci(10)); // Cached result
```

### 6. Monads
Monads are a more advanced concept in functional programming. They provide a way to encapsulate computations, handling side effects and exceptions in a predictable manner. Promises in JavaScript are a common example of monads.

Example in JavaScript:

```js
// Using a Promise as a Monad
const fetchData = () => {
  return new Promise((resolve, reject) => {
    // Simulating fetching data from an API
    setTimeout(() => {
      resolve("Data fetched successfully");
    }, 1000);
  });
};

fetchData()
  .then((data) => {
    console.log(data);
  })
  .catch((error) => {
    console.error(error);
  });
```

Functional programming techniques lead to more modular, maintainable, and predictable code, making it easier to reason about and test. While these techniques may require a shift in thinking for developers used to imperative programming, they offer significant benefits in terms of code quality and reliability.

## Function Currying in JavaScript
Currying is a functional programming technique that allows you to transform a function that takes multiple arguments into a series of unary (single-argument) functions. Each unary function takes one argument and returns another function, eventually leading to the final result.

### Purpose of Currying
Currying can be especially useful in scenarios where you have a function with multiple parameters, but you don't have all the arguments at once. It enables partial function application, meaning you can gradually apply arguments and reuse intermediate functions.

### Example in JavaScript
Let's explore some examples of currying in JavaScript.

#### Basic Currying Example:

```js
// Curried function
const curriedAdd = (a) => (b) => a + b;

// Partial application
const addFive = curriedAdd(5);

console.log(addFive(3)); // Outputs: 8
```

In this example, curriedAdd is a curried function that takes two arguments, a and b. When you provide a, it returns another function that expects b. This allows you to create specialized functions like addFive, which only requires one argument.

#### Currying for Reusability:

```js
// Curried function to create greetings
const greet = (greeting) => (name) => `${greeting}, ${name}!`;

// Create reusable greeting functions
const sayHello = greet("Hello");
const sayHi = greet("Hi");

console.log(sayHello("Alice")); // Outputs: Hello, Alice!
console.log(sayHi("Bob"));      // Outputs: Hi, Bob!
```

In this example, greet is a curried function for creating greetings. You can create specialized greeting functions like sayHello and sayHi, which only require the name argument.

#### Using Currying with Map:

```js
// Curried function to double a number
const double = (x) => x * 2;

// Apply the `double` function to an array
const numbers = [1, 2, 3, 4];
const doubledNumbers = numbers.map(double);

console.log(doubledNumbers); // Outputs: [2, 4, 6, 8]
```

Here, we're using currying to create a double function, which we then use with the map method to double each element in an array.

#### Currying with More Than Two Arguments:

```js
// Curried function to calculate the product of three numbers
const multiply = (a) => (b) => (c) => a * b * c;

// Partial application
const multiplyByTwo = multiply(2);
const multiplyByThree = multiplyByTwo(3);

console.log(multiplyByThree(4)); // Outputs: 24
```

This example demonstrates currying with more than two arguments. The multiply function takes three arguments and can be partially applied to create more specialized functions.

### Benefits of Currying

- **Partial Function Application:** Currying allows you to apply some arguments now and others later, which is useful for creating specialized functions.

- **Reusability:** You can create reusable functions with predefined behavior.

- **Modularity:** Curried functions are more modular and easier to test.

- **Readability:** Curried functions often lead to more readable and concise code.

While currying is a powerful technique, it's important to strike a balance between using it for clarity and avoiding unnecessary complexity in your code.

## Memoization in JavaScript
Memoization is an optimization technique used in computer programming to store the results of expensive function calls and return the cached result when the same inputs occur again. This can significantly improve the performance of functions with repetitive or expensive computations.

### Purpose of Memoization
The primary purpose of memoization is to avoid redundant and time-consuming computations by storing and reusing previously computed results. It's particularly useful for functions with the following characteristics:

- **Pure Functions:** Functions that consistently return the same output for the same input (no side effects).

- **Expensive Computations:** Functions that involve time-consuming calculations, such as recursive algorithms or complex mathematical operations.

- **Repetitive Calls:** Functions that are frequently called with the same arguments, such as in recursive algorithms.

### Examples in JavaScript
Let's explore an example of memoization in JavaScript using a recursive Fibonacci sequence calculation:

```js
// Basic Fibonacci function without memoization
function fibonacci(n) {
  if (n <= 0) return 0;
  if (n === 1) return 1;
  return fibonacci(n - 1) + fibonacci(n - 2);
}

console.time("No Memoization");
console.log(fibonacci(40)); // Try calculating Fibonacci(40) without memoization
console.timeEnd("No Memoization");
```

Calculating fibonacci(40) without memoization can take a considerable amount of time due to the repetitive calculations.

Now, let's apply memoization to the Fibonacci function:

```js
// Fibonacci function with memoization
function fibonacciMemo() {
  const cache = {};
  
  return function memoizedFibonacci(n) {
    if (n <= 0) return 0;
    if (n === 1) return 1;
    
    if (!cache[n]) {
      cache[n] = memoizedFibonacci(n - 1) + memoizedFibonacci(n - 2);
    }
    
    return cache[n];
  }
}

const memoizedFibonacci = fibonacciMemo();

console.time("With Memoization");
console.log(memoizedFibonacci(40)); // Calculate Fibonacci(40) with memoization
console.timeEnd("With Memoization");
```

In this example, we've created a fibonacciMemo function that returns a memoized version of the Fibonacci function. The cache object stores previously computed Fibonacci numbers to avoid redundant calculations.

### Benefits of Memoization
**Improved Performance:** Memoization can significantly reduce the time complexity of functions, especially in scenarios with repetitive computations.

**Efficient Resource Usage:** It helps optimize resource-intensive tasks by reducing CPU and memory usage.

**Simplified Code:** Memoization simplifies code by eliminating the need to manually manage cached results.

**Enhanced User Experience:** Faster execution times lead to a better user experience in applications.

While memoization is a powerful technique for optimizing functions, it's important to use it judiciously. Not all functions benefit from memoization, and it's essential to consider factors like function purity, input variability, and memory consumption when deciding whether to apply memoization.

## Monads in JavaScript
Monads are a design pattern used in functional programming to manage side effects and encapsulate values in a predictable and composable way. They provide a structure for working with values that may have side effects, such as I/O operations, asynchronous code, or exceptions. Monads help maintain the purity and predictability of functional code by isolating these effects.

### Purpose of Monads
Monads serve several purposes in JavaScript and functional programming:

**Managing Side Effects:** Monads allow you to isolate and manage side effects, ensuring that impure operations don't disrupt the purity of your functional code.

**Composability:** Monads provide a way to compose and chain operations on encapsulated values, making your code more modular and readable.

**Error Handling:** Monads can handle exceptions and errors in a controlled manner, preventing them from crashing your program.

**Asynchronous Code:** Monads like the Promise Monad can simplify working with asynchronous operations, making it easier to handle and chain async tasks.

### Example in JavaScript: Using the Maybe Monad
The Maybe Monad is a simple monad that represents values that might be null or undefined. It allows you to perform operations on these values without worrying about null/undefined errors.

Here's an example of using the Maybe Monad in JavaScript:

```js
// Maybe Monad constructor
function Maybe(value) {
  this.value = value;
}

// Maybe Monad map function
Maybe.prototype.map = function (fn) {
  return this.value ? new Maybe(fn(this.value)) : new Maybe(null);
};

// Example usage:
const user = { name: 'Alice', age: 30 };

const getUsername = (user) => user.name;
const getAge = (user) => user.age;

const maybeUser = new Maybe(user);

const username = maybeUser.map(getUsername);
const age = maybeUser.map(getAge);

console.log(username.value); // 'Alice'
console.log(age.value); // 30

const emptyUser = new Maybe(null);

const emptyUsername = emptyUser.map(getUsername);
const emptyAge = emptyUser.map(getAge);

console.log(emptyUsername.value); // null
console.log(emptyAge.value); // null
```

In this example, we create a Maybe Monad that wraps a value. The map method applies a function to the wrapped value if it exists. If the value is null or undefined, it returns a new Maybe Monad with a null value, preventing null/undefined errors.

### Benefits of Monads
**Predictable Code:** Monads provide a predictable structure for handling side effects, making your code more reliable and maintainable.

**Error Isolation:** Monads help isolate and manage errors, preventing them from propagating throughout your application.

**Composition:** Monads enable you to compose functions and operations in a clean and readable way, leading to more modular code.

**Asynchronous Code:** Monads like Promises simplify asynchronous code, making it easier to work with async tasks.

While monads are a powerful tool, they may introduce some complexity to your code, especially if you're new to functional programming. It's important to choose the right monad for your specific use case and ensure that it aligns with your application's architecture and design goals.