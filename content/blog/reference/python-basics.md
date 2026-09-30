---
title: "Python"
date: "2023-10-21T22:40:16-04:00"
description: "Python is a high-level, interpreted programming language known for its simplicity and readability."
author: "Alex Merced"
tags:
  - reference
---
> This reference guide moved here from DataLakehouse.help, which now focuses on lakehouse procedures.

## Basics of Python:
### 1. What Is Python?
Python is a high-level, interpreted programming language known for its simplicity and readability. It was created by Guido van Rossum and first released in 1991. Python is widely used in various domains, including web development, data science, scientific computing, artificial intelligence, and more. It emphasizes code readability and a clean, concise syntax, making it an excellent choice for beginners and experienced developers alike.

### Writing and Running "Hello, World!" in Python
The "Hello, World!" program is a simple yet essential introductory program that displays the message "Hello, World!" on the screen. It's often the first program people write when learning a new programming language, including Python. Follow these steps to create and run the program:

#### 1. Writing the Python Code:
Open your preferred code editor or integrated development environment (IDE) to write Python code. You can use text editors like Notepad, Visual Studio Code, PyCharm, or IDLE (the default Python IDE).

```py
# Hello, World! in Python
print("Hello, World!")
```

In Python, you use the `print()` function to display text on the screen. In this case, we're printing the string "Hello, World!".

#### 2. Saving the File:
Save the file with a `.py` extension, which indicates it's a Python script. Choose a meaningful filename, such as `hello_world.py`. Make sure to select the appropriate file type when saving it.

#### 3. Running the Program:
To run the "Hello, World!" program, open your command prompt or terminal, navigate to the directory where you saved the Python script, and use the python command followed by the script's filename.

For example, if the script is saved as hello_world.py, open your terminal and run:

```bash
python hello_world.py
```

You should see the output:

```
Hello, World!
```

Congratulations! You've just written and executed a "Hello, World!" program in Python. This simple exercise is a great way to verify that your Python environment is set up correctly and that you can write and run Python code. From here, you can start exploring more complex Python applications and programming concepts.

### 2. Defining Variables:
In Python, you can define variables to store and manipulate data. Variable names are case-sensitive and should follow certain naming conventions:

- Variable names can consist of letters (a-z, A-Z), digits (0-9), and underscores (_).
- Variable names must start with a letter or an underscore.
- Python is dynamically typed, meaning you don't need to declare a variable's data type explicitly. Python infers the data type based on the value assigned to it.

##### Examples of defining variables:

```py
# Integer variable
age = 25

# String variable
name = "Alice"

# Boolean variable
is_student = True

# Floating-point variable
price = 9.99
```
### 3. Data Types and Operators:
Python supports various data types and operators for performing operations on data. Here's an overview:

- a. **Numeric Data Types:**
  - **int:** Represents integer values, e.g., 10, -5.
  - **float:** Represents floating-point (decimal) values, e.g., 3.14, -0.5.
  - **complex:** Represents complex numbers, e.g., 1 + 2j.
- b. **String Data Type:**
  - **str:** Represents text or string values, enclosed in single (`'`) or double (`"`) quotes, e.g., 'Hello, World!'.
- c. **Boolean Data Type:**
  - **bool:** Represents Boolean values, either True or False.
- d. **Containers:**
  - **List:** An ordered collection of elements, denoted by square brackets [], e.g., [1, 2, 3].
  - **Tuple:** An ordered, immutable collection of elements, denoted by parentheses (), e.g., (1, 2, 3).
  - **Dictionary:** A collection of key-value pairs, denoted by curly braces {}, e.g., {"name": "Alice", "age": 25}.
  - **Set:** An unordered collection of unique elements, denoted by curly braces {}, e.g., {1, 2, 3}.
- e. **Operators:**
  - **Arithmetic Operators:** + (addition), - (subtraction), * (multiplication), / (division), % (modulo), ** (exponentiation).

  - **Comparison Operators:** == (equal), != (not equal), < (less than), > (greater than), <= (less than or equal), >= (greater than or equal).

  - **Logical Operators:** and (logical AND), or (logical OR), not (logical NOT).

  - **Assignment Operators:** = (assignment), += (add and assign), -= (subtract and assign), *= (multiply and assign), /= (divide and assign), %= (modulo and assign), **= (exponentiate and assign).

  - **Membership Operators:** in (checks if an element is present in a sequence), not in (checks if an element is not present).

  - **Identity Operators:** is (checks if two variables refer to the same object), is not (checks if two variables do not refer to the same object).

These basics provide a foundation for writing Python code. As you explore Python further, you'll delve into more advanced concepts and libraries to build a wide range of applications.

## Writing Conditionals in Python
Conditionals in Python allow you to make decisions and control the flow of your program based on whether certain conditions are met. Python provides several constructs for writing conditionals:

### 1. if Statement:
The if statement is used to execute a block of code if a specified condition is True. It can be followed by one or more elif (short for "else if") blocks and an optional else block.

```py
x = 10

if x > 5:
    print("x is greater than 5")
elif x == 5:
    print("x is equal to 5")
else:
    print("x is less than 5")
```

### 2. Comparison Operators:
Python offers various comparison operators to check conditions. These include `==` (equal), `!=` (not equal), `<` (less than), `>` (greater than), `<=` (less than or equal to), and `>=` (greater than or equal to).

```py
a = 7
b = 5

if a != b:
    print("a is not equal to b")
```
### 3. Logical Operators:
Logical operators like and, or, and not can be used to combine multiple conditions.

```py
age = 25
income = 60000

if age >= 18 and income >= 50000:
    print("You are eligible for the loan")
```

4. Nested Conditionals:
You can nest conditional statements inside other conditionals to handle more complex logic.

```py
x = 10
y = 5

if x > 5:
    if y < 10:
        print("x is greater than 5 and y is less than 10")
```

### 5. Ternary Operator:
Python supports a concise ternary operator for simple conditional expressions.

```py
is_sunny = True
weather = "Good" if is_sunny else "Bad"
print(f"The weather is {weather}")
```

### 6. In Operator:
The in operator is used to check if a value is present in a sequence, such as a list or string.

```py
fruits = ["apple", "banana", "cherry"]

if "apple" in fruits:
    print("Apple is in the list of fruits")
```

### 7. Truthy and Falsy Values:
Python has truthy (evaluates to True) and falsy (evaluates to False) values. Conditions can be based on the truthiness or falsiness of a value.

```py
my_list = []

if my_list:
    print("The list is not empty")
else:
    print("The list is empty")
```

Conditionals are fundamental for writing Python programs that respond to changing circumstances and user inputs. They provide the logic necessary to control the behavior of your code and make it more dynamic and adaptable.

## Loops and Iterating in Python
Loops are fundamental constructs in programming that allow you to execute a block of code repeatedly. Python provides two main types of loops: for loops and while loops, along with mechanisms for iterating over sequences like lists, tuples, dictionaries, and more.

### 1. for Loops:
A for loop is used to iterate over a sequence (such as a list or string) or an iterable object. It executes a block of code for each item in the sequence.

```py
# Example of a for loop
fruits = ["apple", "banana", "cherry"]
for fruit in fruits:
    print(fruit)
```

In this example, the for loop iterates over the fruits list, and the fruit variable takes on each value in the list one by one.

### 2. range() Function:
The range() function generates a sequence of numbers that can be used with a for loop. It is often used when you need to iterate a specific number of times.

```py
# Using range() in a for loop
for i in range(5):  # Iterates from 0 to 4
    print(i)
```
### 3. while Loops:
A while loop continues to execute a block of code as long as a specified condition is True. It's useful when the number of iterations is not known in advance.

```py
# Example of a while loop
count = 0
while count < 5:
    print(count)
    count += 1
```
Be cautious when using while loops to avoid infinite loops.

### 4. Iterating Over Dictionaries:
You can iterate over the keys, values, or key-value pairs of a dictionary using loops:

```py
# Iterating over keys
person = {"name": "John", "age": 30}
for key in person:
    print(key)  # Prints keys: "name", "age"

# Iterating over values
for value in person.values():
    print(value)  # Prints values: "John", 30

# Iterating over key-value pairs
for key, value in person.items():
    print(f"{key}: {value}")  # Prints "name: John", "age: 30"
```
### 5. break and continue Statements:
The break statement is used to exit a loop prematurely when a certain condition is met.
The continue statement is used to skip the current iteration and move to the next iteration of the loop.

### 6. Nested Loops:
You can nest loops (place one loop inside another) to perform more complex iterations, such as iterating over elements in a multi-dimensional list.

```py
# Example of nested loops
matrix = [[1, 2, 3], [4, 5, 6], [7, 8, 9]]
for row in matrix:
    for element in row:
        print(element)
```

Loops are a powerful tool in Python for automating repetitive tasks and processing data. They allow you to perform operations on multiple items without having to write the same code over and over again. Understanding how to use loops effectively is crucial for Python programming.

## Working with Lists in Python
Lists are one of the most commonly used data structures in Python. They allow you to store and manipulate collections of items, whether they are numbers, strings, or even other objects. In this section, we'll explore the basics of working with lists.

### Creating Lists:
You can create lists by enclosing a comma-separated sequence of values within square brackets [ ].

```py
# Creating a list of numbers
numbers = [1, 2, 3, 4, 5]

# Creating a list of strings
fruits = ["apple", "banana", "cherry"]
```

### Accessing List Elements:
List elements are indexed, starting from 0 for the first element. You can access individual elements or slices (sublists) using indexing.

```py
# Accessing individual elements
first_fruit = fruits[0]  # "apple"
second_fruit = fruits[1]  # "banana"

# Slicing a list
subset = numbers[1:4]  # [2, 3, 4]
```

### Modifying Lists:
Lists are mutable, meaning you can change their elements or modify their structure.

```py
# Modifying elements
fruits[0] = "orange"  # Replaces "apple" with "orange"

# Adding elements
fruits.append("grape")  # Adds "grape" to the end of the list

# Removing elements
fruits.remove("banana")  # Removes the first occurrence of "banana"
```

### List Operations:
You can perform various operations on lists, including concatenation and repetition.

```py
# Concatenating lists
combined = numbers + [6, 7, 8]  # [1, 2, 3, 4, 5, 6, 7, 8]

# Repeating lists
repeated = fruits * 2  # ["orange", "banana", "cherry", "orange", "banana", "cherry"]
```

### List Functions and Methods:
Python provides built-in functions and methods for working with lists. Some common functions and methods include:

- `len()`: Returns the length (number of elements) of a list.
- `sorted()`: Returns a new sorted list.
- `min() and max()`: Return the minimum and maximum values in a list.
- `index()`: Returns the index of the first occurrence of a value.
- `count()`: Returns the number of times a value appears in a list.
```py
numbers = [3, 1, 4, 1, 5, 9, 2, 6, 5, 3]

length = len(numbers)  # 10
sorted_numbers = sorted(numbers)  # [1, 1, 2, 3, 3, 4, 5, 5, 6, 9]
min_value = min(numbers)  # 1
max_value = max(numbers)  # 9
count_fives = numbers.count(5)  # 2
```
### List Comprehensions:
List comprehensions provide a concise way to create new lists by applying an expression to each item in an existing list.

```py
# Using a list comprehension to create a new list of squares
numbers = [1, 2, 3, 4, 5]
squares = [x ** 2 for x in numbers]  # [1, 4, 9, 16, 25]
```

Lists are versatile and widely used in Python for a wide range of tasks, from simple data storage to complex data manipulation. Understanding how to work with lists is fundamental for Python programming.

## Working with Dictionaries in Python
Dictionaries are a versatile and powerful data structure in Python. They allow you to store and manipulate data in a key-value pair format. In this section, we'll explore the basics of working with dictionaries.

### Creating Dictionaries:
Dictionaries are created using curly braces {} or the dict() constructor. Each key is associated with a value, and these key-value pairs are separated by colons :.

```py
# Creating a dictionary of person information
person = {"name": "John", "age": 30, "city": "New York"}
```
### Accessing Dictionary Values:
You can access values in a dictionary by specifying the key within square brackets [] or by using the get() method.

```py
# Accessing values by key
name = person["name"]  # "John"
age = person["age"]  # 30

# Using the get() method
city = person.get("city")  # "New York"
```
### Modifying Dictionaries:
Dictionaries are mutable, meaning you can change their values or add new key-value pairs.

```py
# Modifying values
person["age"] = 31  # Updates the age to 31

# Adding a new key-value pair
person["gender"] = "Male"  # Adds a "gender" key with the value "Male"
```
### Dictionary Operations:
You can perform various operations on dictionaries, including copying, merging, and deleting.

```py
# Copying a dictionary
person_copy = person.copy()

# Merging dictionaries
address = {"city": "Los Angeles", "zipcode": "90001"}
person.update(address)  # Merges address dictionary into person

# Deleting a key-value pair
del person["city"]  # Deletes the "city" key-value pair
```
### Dictionary Functions and Methods:
Python provides built-in functions and methods for working with dictionaries:

- `len()`: Returns the number of key-value pairs in a dictionary.
- `keys()`: Returns a list of all keys in the dictionary.
- `values()`: Returns a list of all values in the dictionary.
- `items()`: Returns a list of key-value pairs as tuples.
```py
# Using dictionary functions and methods
num_keys = len(person)  # Number of key-value pairs
all_keys = person.keys()  # List of keys
all_values = person.values()  # List of values
all_items = person.items()  # List of key-value pairs
```
### Dictionary Comprehensions:
Similar to list comprehensions, dictionary comprehensions allow you to create new dictionaries by applying an expression to each key-value pair in an existing dictionary.

```py
# Using a dictionary comprehension to create a new dictionary
squared_numbers = {x: x**2 for x in [1, 2, 3, 4, 5]}
```
### Nested Dictionaries:
Dictionaries can be nested, meaning you can have dictionaries within dictionaries to represent complex data structures.

```py
# Nested dictionary example
person = {
    "name": "John",
    "address": {
        "street": "123 Main St",
        "city": "New York",
        "zipcode": "10001"
    }
}
```

Dictionaries are widely used in Python for tasks such as storing configurations, representing data records, and organizing information in a structured way. Understanding how to work with dictionaries is fundamental for Python programming.

## Writing and Using Functions in Python
Functions are blocks of reusable code that perform specific tasks. They help make your code more organized, modular, and easier to maintain. In Python, functions are defined using the def keyword. Let's explore how to create and use functions:

### Defining a Function:
To define a function, use the def keyword followed by the function name and a pair of parentheses. You can specify function parameters (input values) within the parentheses and end the line with a colon :. The function body is indented.

```py
# Example of a simple function
def greet(name):
    """This function greets the person passed in as a parameter."""
    print(f"Hello, {name}!")

# Function call
greet("Alice")  # Output: "Hello, Alice!"
```
### Function Parameters and Return Values:
Functions can take parameters (also called arguments) as inputs, and they can return values using the return statement.

```py
# Function with parameters and return value
def add(a, b):
    """This function adds two numbers and returns the result."""
    result = a + b
    return result

# Function call
sum_result = add(3, 5)  # sum_result contains the result 8
```
### Default Parameters:
You can specify default values for function parameters, allowing you to call the function without providing all arguments.

```py
# Function with default parameter
def greet(name="Guest"):
    """This function greets a person (or Guest if no name is provided)."""
    print(f"Hello, {name}!")

# Function calls
greet()        # Output: "Hello, Guest!"
greet("Alice") # Output: "Hello, Alice!"
```
### Variable-Length Argument Lists:
Functions can accept a variable number of arguments using *args for positional arguments and **kwargs for keyword arguments.

```py
# Function with variable-length arguments
def add_numbers(*args):
    """This function adds any number of arguments."""
    result = 0
    for num in args:
        result += num
    return result

# Function call
sum_result = add_numbers(1, 2, 3, 4)  # sum_result contains the result 10
```
### Lambda Functions:
Lambda functions (also called anonymous functions) are concise, one-line functions defined using the lambda keyword. They are often used for small, simple operations.

```py
# Lambda function
double = lambda x: x * 2

# Using a lambda function
result = double(5)  # result contains the value 10
```
### Function Documentation:
You can provide documentation for your functions using docstrings (triple-quoted strings). This helps others understand how to use your function.

```py
def my_function():
    """This is a docstring.
    
    It provides information about the function's purpose and usage.
    """
    pass
```
### Function Scope:
Variables defined inside a function have local scope, meaning they are only accessible within that function. Variables defined outside functions have global scope and can be accessed from anywhere in the code.

```py
global_var = 10

def my_function():
    local_var = 5
    print(global_var)  # Accessing global variable
    print(local_var)   # Accessing local variable

my_function()
print(global_var)  # Accessing global variable outside the function
# print(local_var)  # This would result in an error since local_var is not accessible here.
```
Functions are essential for structuring Python programs and breaking them into smaller, reusable parts. They improve code readability, reusability, and maintainability. Understanding how to define, call, and use functions is a fundamental skill in Python programming.

## Writing and Using Classes in Python
Classes are the foundation of object-oriented programming (OOP) in Python. They allow you to create objects with attributes and methods, encapsulating data and behavior into reusable structures. Here's how to define and use classes in Python:

### Defining a Class:
To define a class, use the class keyword followed by the class name. Inside the class, you can define attributes (data) and methods (functions) that belong to the class.

```py
# Example of defining a class
class Person:
    def __init__(self, name, age):
        self.name = name
        self.age = age
    
    def greet(self):
        return f"Hello, my name is {self.name} and I'm {self.age} years old."
```
In the example above, we've defined a Person class with an `__init__` method (a constructor) to initialize the object's attributes (name and age) and a greet method to display information about the person.

### Creating Objects (Instances):
To create an instance (object) of a class, you call the class as if it were a function. This calls the constructor (`__init__` method) to initialize the object.

```py
# Creating instances of the Person class
person1 = Person("Alice", 30)
person2 = Person("Bob", 25)
```
### Accessing Attributes and Methods:
You can access the attributes and methods of an object using dot notation (object.attribute or object.method()).

```py
# Accessing attributes and methods
print(person1.name)  # Accessing attribute
print(person2.greet())  # Calling method
```
### Class Variables and Methods:
Class variables are shared among all instances of a class, while instance variables are unique to each instance. Class methods are defined using the @classmethod decorator and can access and modify class-level attributes.

```py
class Dog:
    species = "Canis familiaris"  # Class variable
    
    def __init__(self, name, breed):
        self.name = name  # Instance variable
        self.breed = breed
    
    @classmethod
    def info(cls):
        return f"A {cls.species} named {cls.name}."
```
### Inheritance:
Inheritance allows you to create a new class based on an existing one. The new class inherits attributes and methods from the parent class and can add or override them.

```py
# Creating a subclass (Student) that inherits from a parent class (Person)
class Student(Person):
    def __init__(self, name, age, student_id):
        super().__init__(name, age)  # Call the parent class constructor
        self.student_id = student_id  # Additional attribute

    def study(self):
        return f"{self.name} is studying."
```
### Encapsulation:
Encapsulation is the concept of hiding the internal details of a class and restricting direct access to certain attributes or methods. In Python, encapsulation can be achieved using private attributes and methods by prefixing them with a double underscore __.

```py
class BankAccount:
    def __init__(self, balance):
        self.__balance = balance  # Private attribute
    
    def deposit(self, amount):
        if amount > 0:
            self.__balance += amount
    
    def withdraw(self, amount):
        if amount > 0 and amount <= self.__balance:
            self.__balance -= amount
```
### Polymorphism:
Polymorphism allows objects of different classes to be treated as objects of a common base class. It enables the use of the same interface for different data types or classes.

```py
# Polymorphism example
def get_description(obj):
    return obj.description()

class Circle:
    def description(self):
        return "This is a circle."

class Square:
    def description(self):
        return "This is a square."

circle = Circle()
square = Square()

print(get_description(circle))  # Output: "This is a circle."
print(get_description(square))  # Output: "This is a square."
```
Classes and OOP concepts are fundamental to Python programming. They allow you to model real-world entities and create organized, reusable, and maintainable code. Understanding how to define, use, and extend classes is crucial for building complex applications in Python.