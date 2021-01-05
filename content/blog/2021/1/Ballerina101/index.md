---
title: Getting Started Programming Ballerina 101
date: "2021-05-01T12:12:03.284Z"
description: Web Application Architecture
---

## What is Ballerina?

From ballerina.io

> Ballerina is an open-source programming language and platform for cloud-era application programmers to easily write software that just works.

> For decades, programming languages have treated networks simply as I/O sources. Ballerina introduces fundamental, new abstractions of client objects, services, resource functions, and listeners to bring networking into the language so that programmers can directly address the Fallacies of Distributed Computing as part of their application logic. This facilitates resilient, secure, performant network applications to be within every programmer’s reach.

## Install Ballerina

To install ballerina just follow the directions here.

- [Ballerina Install](https://ballerina.io/downloads/)

Ballerina has a built-in version manager and runs on the Java Virtual Machine for those who've previously worked with the JVM.

## The Ballerina CLI

Ballerina comes with a pretty handy CLI tool that facilitates version management, package management, and much more.

**USEFUL COMMANDS**

- `ballerina update` update the ballerina tool

- `ballerina dist update` update the current version of ballerina

- `ballerina pull` allows you to pull a module from ballerina central

- `ballerina push` allows you to push a module to ballerina central

- `ballerina search` allows you to search ballerina central

- `ballerina new` generates a new project

- `ballerina add` add a module to the current package

- `ballerina dist list` list all available distributions

- `ballerina dist pull` pull a distribution locally

- `ballerina dist use` select a distribution to become the active distribution

## Your First Project

Navigate to an empty folder, I have a ballerina folder for generating ballerina projects. Run the following command:

`ballerina new helloworld`

A new project folder with the following will be created:

- src folder, this is where the compiler will see out your code
- .gitignore to specify files you want git to ignore
- Ballerina.toml the project config fill like Cargo.toml for rust or package.json for node.

Now cd into the helloworld folder and let's create our first module.

`ballerina add hello`

This creates a new folder in src representing one module. Main this to worry about is the main.bal which is the ballerina file with your code. A module.md is created for you to write documentation on your module. By default, it begins with a hello world script.

```rust

import ballerina/io;

# Prints `Hello World`.

public function main() {
    io:println("Hello World!");
}

```
- import allows us to import external libraries and modules for use in our ballerina scripts

- The naming conventions for packages are similar to Go or Java where the package name is prefixed with a vendor. Ballerina/io means it's the io library created by Ballerina (in their standard libraries).

- Like any compiled languages the application is initiated by the main function, the compiler treats the main function as the starting point of your application. (So when someone runs your executable they are invoking your main function)

- io:println is us invoking the println function from the io module we imported which allows us to print text to the console.

**RUN THE PROJECT** To run the code just run the module with your main function => `bal run hello` to build the jar for distribution run `bal build -a` which will build the entire project.

## Adding a second module

Let's add another module

`ballerina add world`

Head over to the world modules main.bal and include the following:

```rust
import ballerina/io;

# Prints `Hello World`.

public function HelloWorld() {
    io:println("Hello World!");
}

```

So notice we renamed to function to something other than main. This module will not the container of application logic (our main function) but include a helper function we can import for use in our application.

Now looking into Ballerina.toml to find your org-name and change it to "thisworks"

Now head over to the main.bal in the hello module and update it like so...

```rust
// import ballerina/io;
import thisworks/world;

# Prints `Hello World`.

public function main() {
    world:HelloWorld();
}
```

- We commented on the import of io since we are not using it anymore, the compiler will throw errors if we import unused libraries

- we import our world module pre-fixed by our org-name, thisworks.

- We then use the HelloWorld function we defined in the world module.

run the code `ballerina run hello`

try `ballerina run world` since the world module doesn't have the main function, nothing happens.

## Using Ballerina Central Libraries

Let's test this out, run the following command to pull a simple module from Ballerina central.

`ballerina pull sachitha/hello_policy`

This pulls this library into your cache of third party libraries.

Then update your Ballerina.toml

```toml
[project]
org-name= "thisworks"
version= "0.1.0"

[dependencies]
"sachitha/hello_policy" = "0.1.0"
```

Now let's use the new library in our hello module's main.bal

```rust
// import ballerina/io;
import thisworks/world;
import sachitha/hello_policy;

# Prints `Hello World`.

public function main() {
    world:HelloWorld();
    hello_policy:main();
}
```

then run `ballerina run hello`

It Works!

## In Conclusion

- You've downloaded and installed ballerina language
- You've learned how to create a new project
- You've learned how to work with multiple modules
- You've learned how to pull libraries from Ballerina Central

Check out [Ballerina by Example](https://ballerina.io/learn/by-example/) to learn more about Ballerinas syntax and features such as:

- Ability to build docker images and Kubernetes deployment in your code
- Very flexible HTTP library
- much more!