---
title: Where Does My Code Run? - Compilers, Interpreters, Transpilers and Virtual Machines
date: "2021-01-21T12:12:03.284Z"
description: Making Code Happen
---

## Machine Code

Bottom Line, all code will at some point become machine code. Machine Code (This the matrix movies) is the only code a machine understands, anything other than Machine Code is an abstraction.

- **Abstraction:** An implementation that makes working with something more complicated, simpler.

Machine Code changes based on the processor and other aspects of the computer architecture. The operating system is designed to help abstract the architecture and give you a uniform platform to use a computer from multiple architectures and differing hardware (Intel, AMD, ARM).

** The Top Operating Systems **

- Windows
- Linux (Unix Based)
- MacOS (Unix Based)

Every piece of hardware needs drivers to be useable within an operating system.

**Drivers:** Software that allows an operating system to know how to use different hardware like webcams, printers, etc.

At the end of the day... it all becomes machine code.

## High level vs Low-Level languages

- ** Low-Level Programming Languages:** These are languages that closer to Machine Code, these are usually compiled languages like C and C++. These languages often have fewer built-in data structures and lean more heavily on manual memory management. Rust is a newer language aiming to provide a modern low-level language. The benefit of a lower-level language they will be faster since there is more granular control, but with the downside that it requires a lot more programming to do simple tasks.

- **Higher Level Programming Languages:** These are languages that abstract many of the complexities such as creating data structures and managing memory. Languages like Python, Javascript, Ruby, PHP, and many more fall into this category with many data structures available and easily manipulated out of the box and memory management automated via a garbage collector.

## Compiled vs Interpreted

- **Compiled:** Languages like C, C++, Rust, GO, OCAML, and more are compiled to native code (machine code), then the compiled executable is run. Since those who are executing the compiled code don't have to wait for the translation of the code to machine language, the end program runs faster. Although, since the compiler needs code to be explicit as possible (Static Typing) to help understand how to construct the program, these languages often require typing.

**TYPING:** The Practice of explicitly stating what type of data variables will hold, functions will take as parameter and functions will return. Static typing requires the prior declaration of data types of these values, dynamic typing will imply the data type once a value has been stored.

- **Interpreted:** An interpreted language is translated into machine code and immediately executed. Python, Ruby, and Javascript when used as a scripting language are interpreted. You run a python file, the python interpreter translates the code to native code then runs the code. The benefits are you don't have to recompile for different operating systems, long as you have the interpreter on your machine. The cost is translating the code on every execution can have hits to speed for larger applications.

## Transpilation

Transpilation is when instead of compiling code to native code, you are compiling the code into a different language which may then be interpreted or compiled into machine code. 

Probably the most well known transpiled language is Typescript. Typescript is transpiled into javascript which is then interpreted by the browser, node or deno. Since javascript has been the only language web browsers understand (until the very recent introduction of Web Assembly), many have created languages that transpile to javascript like ReScript and CoffeeScript.

## Virtual Machines

The most well-known language to take this approach is Java with its Java Virtual Machine (JVM). The idea is to create a virtual computer that can run on any hardware. Code is compiled into a format that the virtual computer can read (Java bytecode). So you can write a codebase, and compile it once and have it run anywhere cause it runs in the virtual machine. So you get the speed of compilation without the need to recompile it multiple times. Signified in Javas famous slogan, "Write Once, Run Anywhere"

Since Java many existing and new languages got Java Bytecode compilers such as Clojure, Groovy, Haxe, Scheme, Scala, Kotlin, Ballerina and many more.

The Java Virtual Machine isn't the only player in town:

- The Graal VM
- The Erlang VM
- LLVM

All have their own suite of languages that compile to their bytecode.

## Bottom Line

All code becomes machine code at the end of the day but it may travel between several layers of abstraction to get there. With the growing speed of computers, the cost of these abstractions are less and less of a concern but still important to understand.