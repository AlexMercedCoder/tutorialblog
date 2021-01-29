---
title: A Tale of Memory and the Garbage Collector
date: "2021-01-29T12:12:03.284Z"
description: The Stack, The Heap, and Memory Management
---

## It all starts with memory

There is your computer memory (RAM) and its Hard Drive (HD). Think of RAM as your computers short term memory, the dashboard for thinking and executing things. Really, it's just a chip that can generate mini-electrical signals that add up to a bunch of 0's and 1's. The more RAM you have (4gb, 8gb, 16gb, etc.) the more of these signals it can generate meaning the more thoughts (running processes) it can hold its short term memory. (when you shut your computer off, all that electricity is gone along with the info it represented, that's why we need a hard drive to store stuff long term, also probably why you forget so much when you sleep)

Your hard drive is where you store things for a long haul, but it's not where the computer thinks. When you load and program or file, it read it from the hard drive and loads it into RAM for execution, so performance can be heavily affected by the amount of memory you have, but why?

## The Stack

When you execute a program or process, you are really just launching one giant function (if You've ever written code in a compiled language you've probably noticed your whole code is wrapped in a "main" function). That function is the first function that is piled up into a part of the memory referred to as, "the stack".

The stack works literally as its name applies, something new gets stacked on top of the last thing like a stack of pancakes. Just like pancakes, the thing on the top of the stack has to complete before the thing below it and so forth.

So imagine...

- You launch a program that triggers its main function

- The first thing this function does is launch a "print2" function

- Then in that function, a function called "onePlusOne" runs

The stack would resolve in this order...

- First, onePlusOne completes and returns a value to print2

- The print2 completes and returns its value to main

- the main program continues with its next instruction which builds back up on the stack.

## Where things get tricky

All variables on the stack are local to where they are created. So imagine this scenario.

### Scenario 1

- main is invoked

- print2 generates a pointer to an integer and passes the pointer to onePlusOne

- onePlusOne uses the pointer to set the value of the integer that exists in print2 to the result of 1 + 1

-----

In this scenario no function is referencing values owned by functions ahead of it on the stack. Even though onePlusOne calculates a value it is merely setting a value that exists in print2 which is behind it in the stack.

The beauty of this is the stack naturally frees up its own memory without us having to do extra work.

### Scenario 2

- main is invoked

- print2 return the return value of onePlusOne

- onePlusOne generates a new variable sets it to the value of 1 + 1 and returns a pointer to this variable to print2

-----

Here we have a problem. print2 is receiving a pointer to a value that will no longer exist by the time it receives it, (cause we don't get back to print2 till onePlusOne completes, and like an eaten pancake is no longer available).

**The Solution:** There is another part of the memory called the heap that has no real particular order to it. Like a heap of scrambled eggs, there is no beginning or end, just eggs (data). So if instead of declaring the variable, onePlusOne declared a new variable on the heap, then it will exist even after it is done.

The problem with this unlike the stack, the heap doesn't naturally free itself up because it just doesn't know when to do so which means we have to manually tell it to free up that memory when we're done.

## The C Language

If you've ever programmed in C you've probably had to deal with these kinds of memory management conundrums resulting in a lot of extra code. More modern languages now automate this process of determining whether any variable should be left local on the stack to self-clean or be allocated to the heap where someone needs to go back and clean it... and that's the job of the garbage collector.

The garbage collector monitors your code for whether a variable on the heap may potentially be used again, if not, it frees up the memory. Pretty neat, but having this process run does impact performance which is why languages like C are still very much used when the tiniest speed gains truly matter.

## Go and Rust

Go and Rust are both newer languages that seek to find a balance between these considerations. They both still try to abstract as much as possible the thinking of the heap and stack from the developer while optimizing memory usage at compile time by creating a language that leads to the compiler doing more of the optimization work. This allows for a faster language that minimizes the cost of garbage collection.

Higher-level interpreted languages must use garbage collection more liberally because they are interpreted for immediate execution so there isn't much time for the interpreter to do as deep analysis of your code as a compiler can. This is why languages like Python, Ruby, and Javascript will see performance issues at large scales (This is where the Nim and Crystal programming languages come in providing compiled versions of Python and Ruby respectively).

## Conclusion

So while unless you are programming an operating system, drivers, or for a device with very little memory you probably don't need to worry about C or memory management much. Although understanding how the stack and heap work can help you understand the cost of different code patterns and help you naturally write more performant code.