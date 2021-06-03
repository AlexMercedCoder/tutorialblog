---
title: 10 Programming Languages Side by Side (JS, Python, Ruby, PHP, GO, Rust, Dart, C Sharp, Java, Ballerina)
date: "2021-06-02T12:12:03.284Z"
description: Learn Languages by see what's similar and different
---

Using the below you can see the basics of 10 different languages. For most of these langauges you should be able to try them out by [generating a REPL](https//www.repl.it).

## How to print text to the console

One of the first things you need to learn in any language is how to print text in the console. Being able to print text to console allows us to...

- print the value of variables to check that they have the right values
- print the return values of functions so we can make sure they return the right value
- be used just to print text to confirm parts of our code are running

#### Javascript

```js
console.log("Hello World")
```

#### Python

```python
print("Hello World")
```

#### Ruby

```ruby
puts "Hello World"
```

#### PHP

```php
<?php

echo "Hello World";

?>
```

#### GO

```go
import fmt

func main(){
  fmt.Println("Hello World")
}
```

#### Rust

```rust
fn main(){
  print!("Hello World");
}
```

#### Dart

```dart
void main(){
  print("Hello, World!");
}
```

#### C Sharp

```cs
using System;

namespace HelloWorldApp {
  class HelloWorld {
    static void Main(string[] args){
      Console.WriteLine("Hello World");
    }
  }
}
```

#### Java

```java
class HelloWorld {
  public static void main(String[] args){
    System.out.println("Hello, World");
  }
}
```

#### Ballerina

```java
import ballerina/io;

public function main() {
  io:println("Hello World");
}
```

## Declaring Variables

Storing data to use is pivotal in programming. Data is generally stored in variables that we declare. These variables can hold data like numbers, strings and booleans (true/false).

#### Javascript

```js
let number = 5
let str = "Hello"
let bool = true
console.log(number, str, bool)
```

#### Python

```python
number = 5
string = "hello"
boolean = True
print(number, string, boolean)
```

#### Ruby

```ruby
num = 5
str = "Hello"
bool = true
puts num, str, bool
```

#### PHP

```php
<?php
$num = 5;
$str = "Hello";
$bool = true;

echo $num;
echo $str;
echo $bool;
?>
```

#### GO

```go
import fmt

func main(){
  num := 5
  str := "Hello"
  boolean := true
  fmt.Println(num, str, boolean)
}
```

#### Rust

```rust
fn main(){
  let num = 5;
  let string = "Hello";
  let boolean = true;
  print!("{0} - {1} - {2}", num, string, boolean );
}
```

#### Dart

```dart
void main (){
  var number = 5;
  var string = "hello";
  var boolean = true;
  print(number, string, boolean);
}
```

#### C Sharp

```cs
using System;

namespace MyProgramApp {
  class MyProgram {
    static void Main(string[] args){
      int num = 5;
      string str = "Hello";
      bool boolean = true;

      Console.WriteLine(num);
      Console.WriteLine(str);
      Console.WriteLine(boolean);
    }
  }
}
```

#### Java

```java
class Main {
  public static void main(String[] args){
    int num = 5;
    String str = "Hello";
    boolean bool = true;
    System.out.println(num);
    System.out.println(str);
    System.out.println(bool);
  }
}
```

#### Ballerina

```java
import ballerina/io;

public function main(){
  int num = 5;
  string str = "Hello";
  boolean bool = true;

  io:println(num);
  io:println(str);
  io:println(bool);
}

```

## Collection arrays and key/value pairs

Usually you have two main collections you'll use most of the time.

- Arrays/Lists that will be used to store data in an order that is referenced by a zero based index

- A key/value pair structure by which you can reference different values based on a key.

#### Javascript

```js
const myArray = [1,2,3,4,5]
const myObject = {name: "Alex Merced", age: 35}

console.log(myArray)
console.log(myObject)
```

#### Python

```py
my_list = [1,2,3,4,5]
my_dictionary = {"name": "Alex Merced, "age": 35}

print(my_list)
print(my_dictionary)
```

#### Ruby

```ruby
my_array = [1,2,3,4,5]
my_hash = {name: "Alex Merced", age: 35}

puts my_array
puts my_hash
```

#### PHP

```php
<?php

$my_array = [1,2,3,4,5];
$my_associative_array = ["name" => "Alex Merced", "age" => 35];

var_dump($my_array);
var_dump($my_associative_array);

?>
```

#### GO

```go
import fmt

func main(){
  my_slice := []int{1,2,3,4,5}
  my_map := map[string]string{"name":"alex merced", "age":"35"}

  fmt.Println(my_slice)
  fmt.Println(my_map)
}
```

#### Rust

```rust
use std::collections::HashMap;

fn main(){
  let my_array = [1,2,3,4,5];
  let mut my_hashmap = HashMap::new();
  my_hashmap.insert("name", "Alex Merced");
  my_hashmap.insert("age", "35");
  println!("{:?}", my_array); 
  println!("{:?}", my_hashmap);
}

```

#### Dart

```dart
void main (){
  final my_list = [1,2,3,4,5];
  final my_map = {"name": "Alex Merced", "age":"35"}
  print(my_list);
  print(my_map);
}
```

#### C Sharp

```cs
using System;
using System.Collections;

namespace MyProgramApp {
  class MyProgram {
    static void Main(string[] args){
      int[] my_array = {1,2,3,4,5};
      Hashtable my_ht = new Hashtable();
      my_ht.Add("name", "Alex Merced");
      my_ht.Add("age", "35");
      Console.WriteLine(my_array);
      Console.WriteLine(my_ht);
    }
  }
}
```

#### Java

```java
import java.util.*;

class MyProgram {
  public static void main(String[] args){
    int[] my_array = {1,2,3,4,5};
    Hashtable my_ht = new Hashtable();
    my_ht.put("name", "Alex Merced");
    my_ht.put("age", "35");
    System.out.println(my_array);
    System.out.println(my_ht);
  }
}
```

#### Ballerina

```java
import ballerin/io;

public function main(){
  int[] my_array = [1, 2, 3, 4, 5];
  map<string> my_map = {
    "name": "Alex Merced",
    "age" : "35"
  };

  io:println(my_array);
  io:println(my_map);
}

```


## Defining Function

Functions allow you define blocks of code you can run on-demand. Pivotal to any programming language! There are two steps:

- declare/define the function

- call/invoke the function

#### Javascript

```js

function helloWorld(){
  console.log("Hello World")
}

helloWorld()

```

#### Python

```python
def hello_world():
  print("Hello World")

hello_world()
```

#### Ruby

```ruby
def hello_world
  puts "Hello World"
end

hello_world
```

#### PHP

```php
<?php

function helloWorld(){
  echo "Hello World";
}

helloWorld();

?>
```

#### GO

```go
import fmt

func helloWorld(){
  fmt.Println("hello world")
}

func main(){
  helloWorld()
}
```

#### Rust

```rust
fn hello_world(){
  println!("Hello World");
}

fn main(){
  hello_world();
}
```

#### Dart

```dart
void hello_world(){
  print("Hello World");
}

void main(){
  hello_world()
}
```

#### C Sharp

```cs
using System;

namespace MyProgramApp {
  class MyProgram {
    static void Main(string[] args){
      HelloWorld();
    }

    static void HelloWorld(){
      Console.WriteLine("Hello World");
    }
  }
}
```

#### Java

```java
class MyProgram {
  public static void main(String[] args){
    hello_world();
  }

  public static void hello_world(){
    System.out.println("Hello, World");
  }
}
```

#### Ballerina

```java
import ballerina/io;

function hello_world(){
  io:println("Hello World");
}

public function main(){
  hello_world();
}
```

## Learning More

- [Find Video Playlists on All these Languages and more at devNursery](https://www.devnursery.com)
- [Find more tutorials and walkthroughs on my blog](https://tuts.alexmercedcoder.com)