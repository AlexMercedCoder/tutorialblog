---
title: Web Development Glossary 2022
date: "2022-07-16"
description: "The words you need to know as a web professional"
author: "Alex Merced"
category: "frontend"
bannerImage: "/images/postbanner/2022/batch-streaming.png"
tags:
  - web development
---

- **Abstraction**: Something that simplifies the complexities of something else to make it easier to use without the need to understand how it works.

- **Server**: Application running on a network that takes request and generates a response. Often, these responses are either HTML web pages or data JSON format.

- **Client**: Application that is made to create requests to servers and then render the response into something usable for the user. A internet browser is a client application that let's you send requests to web servers and render the html in the response as a visual webpage.

- **Web Browser**: A desktop or mobile application that is for sending requests to web servers to get back a particular web site or web application.

- **Web Application**: A software application written to be consumed via a web browser

- **Mobile Application**: A software application written to be consumed on a mobile device usually as a native app that can be downloaded via the app store.

- **Desktop Application**: A software application written to be consumed on a desktop computer as a standalone application. Not all desktop applications work on all operating systems.

- **Operating System**: Software that acts as an interface between software and hardware. From the end users perspective it provides an interface for the user to interact with their computer, for software developers it abstracts hardware operations like writing to disks and sending network requests to make writing software easier.

- **Programming Language**: A language for creating instruction that will be turned into something a computer can execute.

- **assembly language**: The most basic abstraction over pure binary (0s and 1s) for communicating with a computer processor. Each type of processor chipset often has their own dialect of assembly.

- **Lower Level Languages**: Lower level languages are languages that usually compiled (translated to machine code for later execution) into the assembly language of particular processors (Intel, AMD, ARM) and operating systems (Linux, Mac, Windows). Lower level language often require you handle things like memory management so have a higher learning curve but are also faster. Lower level languages includes C, C++, Rust, Go, Zig, Crystal, Nim, Jai and Odin

- **Higher Level Languages**: Higher level languages are languages that simiplify things like memory management often with a garbage collector. These language are usually interpreted (translated and executed each time the code is run) and have much lower learning curve. Higher level languages include Python, Javascript, Ruby, PHP, Perl, Raku, C#, Java, Ballerina, Switch, Kotlin, Elixir and many more.

- **Functional Programming Languages**: Most programming languages are designed to handle Object Oriented Programming and Functional Programming equally. Functional Programming languages are designed to enforce and enable best practices for Functional programming. These langauges include Haskell, F#, Lisp, Clojure, Ocaml, Scala, Scheme, Erlang and more. These language tend to have a unique learning curve.

- **Object Oriented Programming**: A programming style focused around abstracting concepts and ideas in an application as objects that have certain charachterisics (properties) that can change (mutability) along with actions they can take (methods). Idea like encapsulation, polymorphism, inheritance, composition and more are part of the OOP playbook. Common OOP solutions are referred to as design patterns.

- **Functional Programming**: A programming style focused abstract all processes in an application into a sequence of pure functions (functions that always generate the same result given the same inputs). Functional programming usually uses Records which are made up of unchangeable properties (immutable) instead of objects. Pure Functions and Immutability allow the conditions to use techniques like Currying, Memoization and more to improve performance and create reusable code.

- **Command Line Interface(CLI)**: A CLI is a texted based method of sending commands and receiving output from your operating system and software installed on it. This is usually done through some sort of terminal emulator using Something like bash, zsh, or fsh. Many web server operating systems only allow a command line interface to make more resources available to serving web applications.

- **Graphical User Interfaces(GUI)** A GUI is a visual often point and click or touch interface where you can interact with your operating system and software on it. GUI often times are a lot more limited in what you can do but are often more intuitive for commercial end-users but use up a lot more computer resources to run.

- **Frontend**: The frontend of an application is the User Interface (UI) in appearance and interactivity. Developers that focus on building out this User Experience (UX) are called frontend developers.

- **Backend**: The backend of an application is the data and logic layer, less visual and more focused on connecting to data sources, processing data, and delivering the data the frontend needs for the User experience.

- **Application Programming Interfaces(API)**: Basically a set of standards on how external applications can talk to a particular applications. For example, operating systems have APIs which software can use to interact with the file system and network features of the operating system in their software. Backend web applications often provide access to external application through Rest APIs, GraphQL APIs and RPC APIs each providing a different standard on how other applications can interact with each other.

- **REST API (Representational State Transfer)**: A REST API allows application to interact by sending requests to different urls that respond often with JSON data.

- **GraphQL (Graph Query Language)**: A GraphQL API involves one single url, all requests are sent to that url with a string that represents the request and what data to send back.

- **RPC (Remote Procedure Call)**: An RPC API revolves around a client library that abstracts all http requests into functions that trigger the run of a function on the server. The Developer experience feels like they are calling functions in their applications code but under the hood the call is occuring on the target application which returns data. RPC API often use Proto files to create a contract that the server and client must meet and often send data in a protobuffer format instead of JSON for maximum speed of data delivery.

[Additional Terms will be added here](https://gist.github.com/AlexMercedCoder/40c4ee9cd6a33de0f3fa93075401efdd)