---
title: Rust 101 - The Syntax and Basics
date: "2021-01-04T12:12:03.284Z"
description: A Fun Language for Fast Compiled Apps
---

## Why do we need another lower-level compiled language?

Often times when you need to create faster systems-level software or a faster web server you'd need to leave the world of easier higher-level languages like Python, Ruby, Javascript, and PHP and seek a lower level compiled language like C++.

While C++ will always have a strong position as one of the most popular programming languages, it is a lot more verbose than many new languages and doesn't have some of the syntax innovations languages have added over time and even if they did a lot of the libraries have been around and rely on classic C++ patterns.

So many newer languages have tried to fill the demand for a more modern faster-compiled language.

- Nim (Essentially a compiled version of Python)
- Crystal (Essentially a compiled version of Ruby)
- Rust (Created by Mozilla)
- GO (Created by Google)

In this article, I want to discuss Rust and getting started with Rust.

## Installing Rust

Rust has a tool called RustUP that will let you install multiple versions of rust and easily upgrade versions of Rust, use it to install rust on your system.

- [Install Rust Directions](https://www.rust-lang.org/tools/install)

## The Rust Compiler

When working with a single rust file it can be easier to use the rust compiler. Rust files have a .rs extension. To compile the file you run the following command.

`rustc filename.rs`

This then creates the executable to run with the following command.

`./filename`

May be easier to use a compound command so you can reuse it with subsequent tests.

`rustc filename.rs && ./filename`

## Package Management

There are several awesome Rust libraries in the Rust ecosystem and to take advantage of them you need to use Cargo, Rust's package management system. So instead of writing individual rust files and using the rust compiler directly, we can use Cargo to manage large projects.

Create a new project by running the command

`cargo new projectName`

Then a new folder will be created with the projectName, inside that folder will a cargo.toml which will be the equivalent to nodes package.json in the cargo world. I do recommend reading up on TOML syntax.

- [TOML Syntax](https://github.com/toml-lang/toml)
- [cargo.toml syntax](https://doc.rust-lang.org/cargo/reference/manifest.html)

## Your first Rust Project

In a folder for rust projects run the following command:

`cargo new firstproject`

cd info the folder and open src/main.rs

```rs
fn main() {
    println!("Hello, world!");
}

```

- fn is the keyword for declaring a function

- main() is the function we are declaring, like most compiled languages, the main function is treated as the center of the application. When the code is compiled and the code is run it is essentially invoking the main function.

- println! is a macro, which is special types of built features that can be functions or other things, always used with the exclamation point at the end of the name. The println! macro allows us to print text to the console. Essentially what the macro is doing is replacing itself with code, you can define custom macros, a conversation for another day.

Run the file with the command `cargo run`

Isn't that easier than the rust compiler commands from before?

## Declaring Variables

The key reason Rust exists is to manage memory. To make memory more efficient Rust introduces a lot of new patterns around variables.

Variables are declared with the let keyword

```rust
// Normal Variable Declaration, not mutable
// Type is inferred
let myVar = 5

// Mutable Variable declaration can be reassigned
// Type is inferred
let mut myVar2 = 5
myVar2 = 6

// Constant declaration, not reassignable
// Type must be explicit (32bit unsigned integer)
const MY_CONST:u32 = 5
```

- [List of Rust Data Types](https://doc.rust-lang.org/book/ch03-02-data-types.html)

## Conclusion

Hopefully, now you have Rust installed and can startup and run a rust project. I will be writing more articles on how to do more in rust so to make sure to regularly check my blog at tuts.alexmercedcoder.dev.
