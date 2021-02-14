---
title: Go, Rust and C++ Side by Side
date: "2021-02-10T12:12:03.284Z"
description: Learn All The Things
---

## Why?

Recently I did a blog post where I show the basic syntax in Javascript, Python, Ruby and PHP side by side and got a pretty good response. Figured I'd do the same thing with some lower-level compiled languages. So in this post, I'll be showing how to do many basic things in Go, Rust and C++ (Keep in mind Go and Rust were created to be modern alternatives to situations you'd use C/C++/Java for speed and efficiency).

## Hello World

### C++

```cpp
#include <iostream>

using namespace std;

int main() {
    std::cout << "Hello World \n";
}
```

### Go

```go
package main

import "fmt"

func main(){
	fmt.Println("Hello World")
}

// go run HelloWorld.go
```

### Rust

```rust
fn main() {
    println!("Hello World!");
}

// rustc HelloWorld.rs && ./HelloWorld
```

## Declaring Variables

### C++

```cpp
#include <iostream>

using namespace std;

int main() {
    int num = 5;
    bool isItTrue = true;
    char str[] = "Hello World";
    std::cout << "Hello World \n" << str << endl;
}
```

### Go

```go
package main

import "fmt"

func main(){
	var num int = 5
	var isItTrue bool = true
	var hello string = "Hello World"
	dynamicTyping := 6
	fmt.Println("Hello World")
}
```

### Rust

```rust
fn main() {
    let x = 5; //immutable
    let mut y = 6; //mutable
    const TYPED_CONSTANT:u32 = 100_000;
    let isItTrue:bool = true;
    let aString: str = "Hello World";

    println!("Hello World!");
}
```

## Arrays and Key/Value Pairs

### C++

```cpp
#include <iostream>

using namespace std;

int main() {
    int nums[] = {1,2,3,4,5,6};
    int five = nums[1] + nums[2];
    std::cout << "Hello World \n";
}
```

### Go

```go
package main

import "fmt"

func main(){
	arr := [5]int{1,2,3,4,5}
	five := arr[1] + arr[2]
	fmt.Println("Hello World")
}
```

### Rust

```rust
fn main() {
    let nums: [i32; 5] = [1,2,3,4,5];
    let five: i32 = nums[1] + nums[2];

    println!("Hello World!");
}
```

## Functions

### C++

```cpp
#include <iostream>

using namespace std;

int addNums (int x, int y){
    return x + y;
}

int main() {
    int num = addNums(5, 6); //returns 11
    std::cout << "Hello World \n";
}
```

### Go

```go
package main

import "fmt"

func addOne(x int, y int) int {
	return x + y
}

func main(){
	num := addOne(5,6)
	fmt.Println("Hello World")
}
```

### Rust

```rust
fn main() {
    let num: i32 = addOne(5,6);

    println!("Hello World!");
}

fn addOne(x: i32, y: i32) -> i32{
    x+y;
}
```

## OOP

### C++

```cpp
#include <iostream>
#include <string>
#include <cstring>

using namespace std;
class Dog {

    //property declaration
    public:
    string name;
    int age;

    //constructor sig
    Dog(string n, int a);

    //method sigs
    void bark();
};

Dog::Dog(string n, int a){
    name = n;
    age = a;
}

void Dog::bark(){
    std::cout << "Woof! \n";
}

int main() {
    Dog sparky("Sparky", 5);
    sparky.bark();
}
```

### Go

```go
package main

import "fmt"

//Define a struct
type Dog struct {
	name string
	age int
}

// Struct Method
func (dog Dog) bark(){
	fmt.Printf(dog.name + " barks.")
}

func main(){
	sparky := Dog{"Sparky", 5}
	sparky.bark()
}
```

### Rust

```rust
// declare a struct
struct Dog {
    name: String,
    age: i32
}

// declare methods

impl Dog {
    fn bark(&self){
        println!("{} is barking", self.name);
    }
}

fn main() {
    let sparky = Dog{name: String::from("Sparky"), age: 5};

    println!("{} is of age {}", sparky.name, sparky.age);
    sparky.bark();
}
```

## In Conclusion

I hope this gives you a nice visual of what is the same and different between these languages.