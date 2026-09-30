---
title: "Python Tips and Tricks"
date: "2023-10-21T22:40:16-04:00"
description: "A quick-reference table of Python idioms: the purpose, the syntax, and an example for each trick, from swapping variables to comprehensions."
author: "Alex Merced"
tags:
  - reference
---
> This reference guide moved here from DataLakehouse.help, which now focuses on lakehouse procedures.

## Part 1

| Purpose                                      | Syntax                                   | Example                                            |
|----------------------------------------------|------------------------------------------|----------------------------------------------------|
| Swap two variables' values                   | `a, b = b, a`                            | `a, b = 5, 10` -> `a, b = 10, 5`                 |
| Find the maximum or minimum of a list        | `max_value = max(lst)`                   | `max_value = max([3, 7, 2, 8])` -> `8`           |
| Check if all elements in a list are true     | `all_true = all(lst)`                   | `all_true = all([True, True, False])` -> `False` |
| Create a list with a range of values         | `my_list = list(range(1, 6))`            | `my_list = [1, 2, 3, 4, 5]`                     |
| Find the index of the maximum element        | `index = lst.index(max(lst))`            | `index = [3, 7, 2, 8].index(8)` -> `3`           |
| Create a one-liner for-loop                  | `[x*2 for x in range(1, 6)]`            | `[2, 4, 6, 8, 10]`                               |
| Remove duplicates from a list                | `unique_lst = list(set(lst))`           | `unique_lst = [1, 2, 2, 3, 3, 4]` -> `[1, 2, 3, 4]` |
| Read lines from a file into a list           | `with open('file.txt') as f: lines = f.readlines()` | `lines` contains lines from 'file.txt'      |
| Create a dictionary with default values      | `my_dict = defaultdict(int)`            | `my_dict['key']` returns 0 if 'key' doesn't exist |
| Find the factorial of a number              | `import math; factorial = math.factorial(n)` | `factorial = math.factorial(5)` -> `120` |
| Iterate over dictionary key-value pairs     | `for key, value in my_dict.items():`     | `for k, v in {'a': 1, 'b': 2}.items():`        |
| Use a ternary conditional expression        | `value = 'Yes' if condition else 'No'`  | `result = 'Pass' if score >= 70 else 'Fail'`     |
| Create a copy of a list without references  | `new_lst = old_lst.copy()`              | `new_lst` is a separate list from `old_lst`    |
| Find the length of a list or string         | `length = len(my_list)`                 | `length = len('Hello')` -> `5`                  |
| Reverse a string or list                   | `reversed_str = my_str[::-1]`           | `reversed_str = 'Hello'[::-1]` -> `'olleH'`     |
| Convert a string to uppercase or lowercase  | `upper_str = my_str.upper()`            | `upper_str = 'hello'.upper()` -> `'HELLO'`      |
| Check if a string starts or ends with a substring | `my_str.startswith('prefix')`     | `my_str.endswith('suffix')`                     |
| Merge two dictionaries                     | `dict1.update(dict2)`                   | `dict1` now contains keys and values from `dict2` |
| Count occurrences of an element in a list   | `count = my_list.count(element)`        | `count = [1, 2, 2, 3, 3, 4].count(2)` -> `2`     |
| Check if a value exists in a list or string | `exists = value in my_list`             | `exists = 'e' in 'Hello'` -> `True`             |
| Use a generator expression                 | `(x**2 for x in range(1, 6))`           | Returns a generator object for squared values   |
| Get the current date and time               | `from datetime import datetime; now = datetime.now()` | `now` contains current date and time  |
| Use list comprehension to filter elements   | `[x for x in my_list if x % 2 == 0]`     | Filters even numbers from `my_list`              |
| Find the most common element in a list     | `from collections import Counter; most_common = Counter(my_list).most_common(1)` | Returns a list of the most common element(s) |


## Part 2

| Purpose                                      | Syntax                                   | Example                                            |
|----------------------------------------------|------------------------------------------|----------------------------------------------------|
| Check if a string is empty                   | `is_empty = not bool(my_str)`           | `is_empty = not bool('Hello')` -> `False`         |
| Sort a list in place                        | `my_list.sort()`                         | `my_list.sort()` sorts `my_list` in ascending order |
| Create a list of unique elements             | `unique_list = list(set(my_list))`      | `unique_list = list(set([1, 2, 2, 3]))` -> `[1, 2, 3]` |
| Find the index of an element in a list      | `index = my_list.index(element)`        | `index = ['a', 'b', 'c'].index('b')` -> `1`        |
| Iterate over a list in reverse order        | `for item in reversed(my_list):`       | Iterates over `my_list` in reverse                |
| Find the absolute value of a number         | `abs_value = abs(number)`               | `abs_value = abs(-5)` -> `5`                      |
| Remove whitespace from the beginning and end of a string | `trimmed_str = my_str.strip()` | Removes leading and trailing whitespace |
| Use a dictionary to count element occurrences | `counts = {item: my_list.count(item) for item in my_list}` | Creates a dictionary of element counts |
| Check if all elements in a list are unique  | `is_unique = len(my_list) == len(set(my_list))` | `is_unique = len([1, 2, 3, 2]) == len(set([1, 2, 3, 2]))` -> `False` |
| Convert a list of strings to a single string | `joined_str = ''.join(my_list)`     | `joined_str = ''.join(['Hello', ' ', 'World'])` -> `'Hello World'` |
| Use a dictionary to map values to keys      | `my_dict = {value: key for key, value in key_value_pairs}` | Creates a dictionary mapping values to keys |
| Find the square root of a number            | `import math; sqrt_value = math.sqrt(number)` | `sqrt_value = math.sqrt(9)` -> `3.0`           |
| Generate a list of numbers within a range   | `number_list = list(range(start, stop, step))` | `number_list = list(range(1, 10, 2))` -> `[1, 3, 5, 7, 9]` |
| Find the least common multiple (LCM) of two numbers | `import math; lcm = abs(a * b) // math.gcd(a, b)` | `lcm = abs(12 * 18) // math.gcd(12, 18)` -> `36` |
| Combine string formatting and variables     | `formatted_str = f"My name is {name}, and I am {age} years old."` | Uses f-strings for dynamic string formatting |
| Use a dictionary to provide default values  | `value = my_dict.get(key, default_value)` | `value = my_dict.get('key', 'Not found')` |
| Filter elements from a list with a lambda function | `filtered_list = list(filter(lambda x: x % 2 == 0, my_list))` | Filters even numbers from `my_list` |
| Create a function with default arguments    | ```python def greet(name="Guest"): return f"Hello, {name}!"``` | Defines a function with a default argument |
| Use a generator function to save memory     | ```python def fibonacci(n): a, b = 0, 1; while n > 0: yield a; a, b, n = b, a + b, n - 1``` | Generates Fibonacci numbers efficiently |
| Find the unique elements shared by two lists | `common_elements = list(set(list1) & set(list2))` | Finds common elements between `list1` and `list2` |
| Create a dictionary with keys from a list and default values | `my_dict = dict.fromkeys(key_list, default_value)` | `my_dict = dict.fromkeys(['a', 'b'], 0)` -> `{'a': 0, 'b': 0}` |
| Remove all occurrences of an element from a list | `my_list = [x for x in my_list if x != element]` | Removes all occurrences of `element` from `my_list` |
| Use a lambda function for quick calculations | `square = lambda x: x ** 2` | `square(4)` returns `16` |
| Check if a string contains only digits      | `is_digit_str = my_str.isdigit()`       | `is_digit_str = '12345'.isdigit()` -> `True`      |

## Part 3

| Purpose                                      | Syntax                                   | Example                                            |
|----------------------------------------------|------------------------------------------|----------------------------------------------------|
| Find the index of the first occurrence of an element | `index = my_list.index(element)`  | `index = ['a', 'b', 'c'].index('b')` -> `1`        |
| Use the `enumerate` function to get index and value | `for index, value in enumerate(my_list):` | Access index and value in a loop |
| Check if a list is empty                     | `is_empty = not bool(my_list)`          | `is_empty = not bool([])` -> `True`                |
| Use a set for efficient membership tests    | `my_set = set(my_list); exists = value in my_set` | `exists = 3 in {1, 2, 3, 4}` -> `True`           |
| Swap case in a string                       | `swapped_str = my_str.swapcase()`        | `swapped_str = 'Hello'.swapcase()` -> `'hELLO'`    |
| Use the `zip` function to combine two lists  | `combined_list = list(zip(list1, list2))` | `combined_list` contains pairs from `list1` and `list2` |
| Convert a string to a list of characters    | `char_list = list(my_str)`               | `char_list = list('Python')` -> `['P', 'y', 't', 'h', 'o', 'n']` |
| Use the `collections.Counter` for counting elements | `from collections import Counter; counts = Counter(my_list)` | Counts occurrences of elements |
| Find the number of lines in a text string    | `line_count = len(text.splitlines())`   | `line_count = len("Line 1\nLine 2\nLine 3".splitlines())` -> `3` |
| Create a dictionary with multiple keys mapping to the same value | `my_dict = dict.fromkeys(keys, value)` | `my_dict = dict.fromkeys(['a', 'b'], 0)` -> `{'a': 0, 'b': 0}` |
| Use a dictionary comprehension to create dictionaries | `{key: value for key, value in zip(keys, values)}` | Creates a dictionary from two lists |
| Remove leading and trailing characters from a string | `stripped_str = my_str.strip("characters")` | Removes specified characters from the beginning and end |
| Convert a list of dictionaries into a dictionary of lists | `result_dict = {key: [d[key] for d in dict_list] for key in dict_list[0]}` | Reorganizes data into a dictionary of lists |
| Find the most frequent element in a list   | `from statistics import mode; most_frequent = mode(my_list)` | Finds the most frequent element |
| Use list comprehension for conditional filtering | `[x for x in my_list if condition]`    | Filters elements based on a condition |
| Join elements of a list into a string with a separator | `joined_str = separator.join(my_list)` | `joined_str = ','.join(['apple', 'banana', 'cherry'])` -> `'apple,banana,cherry'` |
| Check if a string contains only letters and digits | `is_alphanumeric = my_str.isalnum()`   | `is_alphanumeric = 'Python3'.isalnum()` -> `True` |
| Calculate the sum of elements in a list     | `total = sum(my_list)`                   | `total = sum([1, 2, 3, 4, 5])` -> `15`             |
| Extract keys or values from a dictionary    | `keys = list(my_dict.keys())`            | `values = list(my_dict.values())`                |
| Replace multiple characters in a string     | `translated_str = my_str.translate(str.maketrans(old_chars, new_chars))` | Replaces multiple characters |
| Generate random numbers                      | `import random; random_number = random.randint(min_value, max_value)` | `random_number = random.randint(1, 100)` |
| Check if a file exists                       | `import os; exists = os.path.isfile(file_path)` | `exists = os.path.isfile('my_file.txt')` -> `True` |
| Calculate the length of the longest string in a list | `max_length = max(len(item) for item in my_list)` | Finds the length of the longest string |
| Use a list comprehension to flatten a nested list | `[item for sublist in nested_list for item in sublist]` | Flattens a list of lists |
| Iterate over a string in reverse order      | `for char in reversed(my_str):`          | Iterates over characters in reverse order |


## Part 4

| Purpose                                      | Syntax                                   | Example                                            |
|----------------------------------------------|------------------------------------------|----------------------------------------------------|
| Convert a string to title case               | `title_case_str = my_str.title()`        | `title_case_str = 'python is cool'.title()` -> `'Python Is Cool'` |
| Use the `collections.defaultdict` for default values | `from collections import defaultdict; my_dict = defaultdict(default_value)` | Provides default values for dictionary keys |
| Find the most common characters in a string  | `from collections import Counter; common_chars = Counter(my_str).most_common(3)` | Finds the 3 most common characters |
| Generate a list of prime numbers             | ```python def is_prime(n): return n > 1 and all(n % i != 0 for i in range(2, int(n**0.5) + 1)); primes = [x for x in range(2, limit) if is_prime(x)]``` | Generates a list of prime numbers up to a limit |
| Calculate the average of elements in a list  | `average = sum(my_list) / len(my_list)`   | `average = sum([1, 2, 3, 4, 5]) / 5` -> `3.0`  |
| Find the index of the last occurrence of an element | `index = len(my_list) - my_list[::-1].index(element) - 1` | `index = ['a', 'b', 'c', 'b'].index('b')` -> `3`  |
| Perform multiple operations in a single line | ```python result = (value * 2 for value in my_list if value % 2 == 0)``` | Applies multiple operations to filter and modify a list |
| Use `timeit` for measuring execution time    | ```python import timeit; execution_time = timeit.timeit(stmt="your_code_here", number=1000)``` | Measures the execution time of code |
| Replace a specific occurrence of a substring in a string | `new_str = my_str.replace(old_substring, new_substring, occurrence)` | Replaces only the specified occurrence |
| Use `zip` with `*` for transposing a matrix   | `transposed_matrix = list(zip(*matrix))` | Transposes a 2D matrix |
| Calculate the greatest common divisor (GCD)  | `import math; gcd = math.gcd(a, b)`     | `gcd = math.gcd(24, 36)` -> `12` |
| Count occurrences of a substring in a string | `count = my_str.count(substring)`        | `count = 'hello world'.count('l')` -> `3` |
| Find the second largest element in a list    | `second_largest = max(filter(lambda x: x != max(my_list), my_list))` | Finds the second largest element |
| Use `functools.reduce()` for cumulative operations | `from functools import reduce; product = reduce(lambda x, y: x * y, my_list)` | Calculates the product of elements |
| Check if all elements in a list are identical | `are_identical = all(x == my_list[0] for x in my_list)` | `are_identical = all([1, 1, 1, 1])` -> `True` |
| Flatten a list of lists using `itertools.chain` | `from itertools import chain; flat_list = list(chain(*list_of_lists))` | Flattens a list of lists |
| Find the index of the minimum element in a list | `index = my_list.index(min(my_list))`  | `index = [5, 2, 8, 1, 7].index(1)` -> `3` |
| Create a list of numbers using a generator expression | `[x for x in range(start, stop)]`     | Generates a list of numbers within a range |
| Count trailing zeros in a factorial number   | ```python def count_trailing_zeros(n): count = 0; while n % 10 == 0: n //= 10; count += 1; return count``` | `count_trailing_zeros(12000)` returns `3` |
| Use a deque for efficient queue operations   | `from collections import deque; queue = deque()` | Implements a queue with fast operations |
| Check if a string contains only whitespace characters | `is_whitespace = my_str.isspace()` | `is_whitespace = ' \t\n'.isspace()` -> `True` |
| Split a list into chunks of a specific size  | ```python chunked_list = [my_list[i:i + chunk_size] for i in range(0, len(my_list), chunk_size)]``` | Splits `my_list` into chunks of size `chunk_size` |
| Use the `random.sample()` function for random sampling | `import random; sample = random.sample(population, k)` | Generates a random sample of size `k` from `population` |
| Create a function that accepts an arbitrary number of arguments | `def my_function(*args):` | Defines a function that accepts a variable number of arguments |
| Use the `zip` function for parallel iteration | ```python for item1, item2 in zip(list1, list2):``` | Iterates over two lists in parallel |
| Retrieve the last `n` elements from a list | `last_n_elements = my_list[-n:]` | `last_n_elements = [1, 2, 3, 4, 5][-3:]` -> `[3, 4, 5]` |


