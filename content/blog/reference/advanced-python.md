---
title: "Advanced Python"
date: "2023-10-21T22:40:16-04:00"
description: "List comprehensions and dictionary comprehensions are powerful and concise ways to create lists and dictionaries in Python."
author: "Alex Merced"
tags:
  - reference
---
> This reference guide moved here from DataLakehouse.help, which now focuses on lakehouse procedures.

## Python List and Dictionary Comprehensions

List comprehensions and dictionary comprehensions are powerful and concise ways to create lists and dictionaries in Python. They allow you to generate new data structures by applying an expression to each item in an iterable (e.g., a list or a range) or by iterating through key-value pairs in a dictionary. These comprehensions are often used to replace loops for simple operations, making your code more readable and efficient.

### List Comprehensions
List comprehensions create new lists by applying an expression to each item in an iterable and optionally filtering items based on a condition.

#### Basic List Comprehension Syntax:

```python
new_list = [expression for item in iterable]
```
##### Example 1: Creating a list of squares

```python
numbers = [1, 2, 3, 4, 5]
squares = [x**2 for x in numbers]
# Result: [1, 4, 9, 16, 25]
```
##### Example 2: Filtering even numbers

```python
numbers = [1, 2, 3, 4, 5, 6]
even_numbers = [x for x in numbers if x % 2 == 0]
# Result: [2, 4, 6]
```

### Dictionary Comprehensions
Dictionary comprehensions create new dictionaries by specifying both key-value pairs and an expression for generating values based on an iterable.

#### Basic Dictionary Comprehension Syntax:

```python
new_dict = {key: value_expression for item in iterable}
```

##### Example 1: Creating a dictionary of squares

```python
numbers = [1, 2, 3, 4, 5]
squares_dict = {x: x**2 for x in numbers}
# Result: {1: 1, 2: 4, 3: 9, 4: 16, 5: 25}
```
##### Example 2: Filtering items based on a condition

```python
data = {'Alice': 30, 'Bob': 35, 'Charlie': 25, 'David': 40}
adults = {name: age for name, age in data.items() if age >= 18}
# Result: {'Alice': 30, 'Bob': 35, 'David': 40}
```

### Nested Comprehensions
You can also nest list comprehensions and dictionary comprehensions to create more complex data structures.

#### Example: Creating a matrix

```python
matrix = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
flattened_matrix = [num for row in matrix for num in row]
# Result: [1, 2, 3, 4, 5, 6, 7, 8, 9]
```

#### Example: Transposing a matrix

```python
matrix = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
transposed = [[row[i] for row in matrix] for i in range(len(matrix[0]))]
# Result: [[1, 4, 7], [2, 5, 8], [3, 6, 9]]
``` 

List and dictionary comprehensions are not only concise but also improve code readability by reducing the need for explicit loops and temporary variables. However, it's important to use them judiciously to maintain code clarity and readability, especially for complex operations.

## The * and ** Operators in Python with Lists and Dictionaries

In Python, the * and ** operators have special meanings when used with lists and dictionaries. These operators allow you to unpack or spread the contents of iterable objects (lists and dictionaries) in various ways. They are powerful tools for manipulating and passing data in concise and flexible ways.

### The * Operator
The * operator, also known as the "splat" or "unpacking" operator, is used to unpack the elements of an iterable (e.g., a list or tuple). It is often used in function calls and list comprehensions.

#### Using * with Lists:

```python
# Unpacking elements of a list
numbers = [1, 2, 3]
print(*numbers)  # Result: 1 2 3

# Combining lists
list1 = [1, 2]
list2 = [3, 4]
combined = [*list1, *list2]
# Result: [1, 2, 3, 4]
```

Using * in Function Calls:

```python
# Unpacking arguments from a list
def add(a, b):
    return a + b

values = [2, 3]
result = add(*values)  # Equivalent to add(2, 3)
# Result: 5
```
#### Using * in List Comprehensions:

```python
# Flattening a list of lists
matrix = [[1, 2], [3, 4]]
flattened = [num for row in matrix for num in row]
# Result: [1, 2, 3, 4]
```

### The ** Operator
The ** operator is used to unpack the key-value pairs of a dictionary. It is often used in function calls and when merging dictionaries.

#### Using ** with Dictionaries:

```python
# Unpacking key-value pairs of a dictionary
person = {'name': 'Alice', 'age': 30}
print(**person)  # Equivalent to print(name='Alice', age=30)

# Merging dictionaries
dict1 = {'a': 1, 'b': 2}
dict2 = {'b': 3, 'c': 4}
merged = {**dict1, **dict2}
# Result: {'a': 1, 'b': 3, 'c': 4}
```

##### Using ** in Function Calls:

```python
# Unpacking keyword arguments from a dictionary
def greet(name, age):
    return f"Hello, {name}! You are {age} years old."

person = {'name': 'Alice', 'age': 30}
message = greet(**person)  # Equivalent to greet(name='Alice', age=30)
# Result: "Hello, Alice! You are 30 years old."
```

The * and ** operators provide a convenient way to manipulate and pass data in Python. They are especially useful when dealing with variable-length arguments or when combining the contents of iterable objects. Understanding how to use these operators effectively can lead to cleaner and more expressive code.

## Python Pattern Matching

Pattern matching is a powerful feature introduced in Python 3.10, inspired by similar syntax found in languages like Scala, Erlang, and others. It allows you to match a value (the subject) against different patterns until a match is found. Each pattern describes the structure and type of accepted values and can capture their contents into variables.

### Patterns and Shapes
Patterns in Python's pattern matching come in various forms:

**Literal Pattern:** Matches a constant value, such as numbers, strings, None, True, or False.

```python
match value:
    case 0:
        print("Zero")
    case "hello":
        print("Hello, world!")
```
**Capture Pattern:** Binds a variable to the matched value.

```python
match data:
    case x:
        print(f"Matched: {x}")
```
**Wildcard Pattern:** Denoted by _, matches any value but doesn't capture it.

```python
match value:
    case _:
        print("Anything matches")
```
**Constant Value Pattern:** Matches specific named constants, like Color.RED.

```python
match color:
    case Color.RED:
        print("Red color")
```
**Sequence Pattern:** Matches sequences (lists, tuples) with specific sub-patterns.

```python
match sequence:
    case [x, y]:
        print(f"Matched sequence: {x}, {y}")
```
**Mapping Pattern:** Matches dictionaries with specific keys and their corresponding sub-patterns.

```python
match data:
    case {"name": name, "age": age}:
        print(f"Name: {name}, Age: {age}")
```
**Class Pattern:** Matches instances of a class with specific attributes.

```python
match obj:
    case Point(x=x, y=y):
        print(f"Point at ({x}, {y})")
```
**OR Pattern:** Matches if any of its sub-patterns match.

```python
match value:
    case int(x) | float(x):
        print(f"Numeric value: {x}")
```
**Walrus Pattern:** Captures a variable and matches a sub-pattern.

```python
match data:
    case result := process():
        print(f"Result: {result}")
```

### The Match Statement
The match statement is used to perform pattern matching. It consists of a subject expression (the value to be matched) and one or more case clauses.

```python
match subject_expression:
    case pattern_1:
        # Code to execute if pattern_1 matches
    case pattern_2:
        # Code to execute if pattern_2 matches
    # ...
```
The match statement compares the subject expression to each pattern until a match is found. The first matching pattern's code block is executed. If no pattern matches, the code continues with the next statement.

### Motivation
Pattern matching is introduced to simplify handling data with varying types, structures, or combinations of attributes. It reduces complex chains of nested if and elif statements, type checks, and attribute access, making code more readable and concise.

Example
Here's a simple example of pattern matching to handle different types of data:

```python
def process_data(data):
    match data:
        case 42:
            print("The Answer to the Ultimate Question of Life, the Universe, and Everything")
        case str(s):
            print(f"A string with length {len(s)}")
        case [x, y]:
            print(f"A list with elements {x} and {y}")
        case {"name": name, "age": age}:
            print(f"Name: {name}, Age: {age}")
        case _:
            print("Unknown data")

# Example usage:
process_data(42)
process_data("Hello, world!")
process_data([1, 2])
process_data({"name": "Alice", "age": 30})
process_data(None)
```

This code demonstrates how pattern matching can handle various types and structures in a clear and concise manner.

Pattern matching in Python is a powerful feature that simplifies code and enhances readability when dealing with complex data structures and varying input types. It's a valuable addition to the language, making it more expressive and user-friendly.