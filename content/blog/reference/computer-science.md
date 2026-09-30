---
title: "Computer Science"
date: "2023-10-21T23:27:29-04:00"
description: "Computer science fundamentals in one reference: number bases, how processors, RAM, and storage work together, assembly language, and object-oriented versus functional programming."
author: "Alex Merced"
tags:
  - reference
---
> This reference guide moved here from DataLakehouse.help, which now focuses on lakehouse procedures.

## Understanding Base Counting: Base 10, Base 16, and Base 2
Base counting, also known as numeral systems or positional notation, is the way we represent numbers using a set of symbols and rules. Common numeral systems include Base 10 (decimal), Base 16 (hexadecimal), and Base 2 (binary). In this section, we will explore these numeral systems and discuss why computers use Base 2 for binary representation.

### Base 10 (Decimal)
Base 10, or the decimal system, is the numeral system most familiar to people. It uses ten symbols (0-9) to represent numbers. Each digit's position in a number indicates its value. For example, in the number 123, the digit '1' represents 100, '2' represents 20, and '3' represents 3, resulting in a total value of 123.

Base 10 is well-suited for human use because we have ten fingers, making it a natural choice for everyday counting and arithmetic.

### Base 2 (Binary)
Base 2, or the binary system, uses only two symbols (0 and 1) to represent numbers. Binary is the fundamental numeral system used in computing and digital electronics. In binary, each digit represents a power of 2. For example, in the binary number 1011, '1' represents 2^3 (8), '0' represents 2^2 (4), '1' represents 2^1 (2), and '1' represents 2^0 (1), resulting in a total value of 11 in decimal.

### Base 16 (Hexadecimal)
Base 16, or the hexadecimal system, uses sixteen symbols (0-9 and A-F) to represent numbers. Hexadecimal is often used in computing to represent binary data more compactly. Each digit in a hexadecimal number represents a power of 16. For example, in the number 1A3, '1' represents 16^2 (256), 'A' represents 16^1 (16), and '3' represents 16^0 (1), resulting in a total value of 275 in decimal.

Hexadecimal is particularly useful for representing binary data because each hexadecimal digit corresponds to exactly four binary digits (bits). This one-to-four relationship simplifies the conversion between binary and hexadecimal.

### Why Computers Use Base 2 (Binary)
Computers use Base 2 (binary) as their primary numeral system for several reasons:

**Simplicity:** Electronic circuits in computers can easily represent two states, such as on/off or high/low voltage, which aligns perfectly with binary's two symbols (0 and 1).

**Reliability:** Binary is less susceptible to errors in communication and data storage, making it highly reliable in digital systems.

**Efficiency:** Binary operations are simple and efficient for electronic components to perform, enabling fast calculations and data processing.

**Consistency:** Using a consistent binary system simplifies digital design and ensures uniformity in hardware and software.

**Compact Representation:** Binary values require less storage space than decimal equivalents, important for memory efficiency.

While humans find binary less intuitive than decimal, computers excel at processing binary data quickly and accurately. When working with computers, it's essential to understand binary representation, as it underlies all digital operations, including data storage, arithmetic, and logic.

## Understanding Computer Components: Processors, RAM, and Hard Drives
To comprehend how computers function, it's essential to understand the core components that enable their operation: processors (CPUs), RAM (Random Access Memory), and hard drives (HDDs or SSDs). In this section, we'll delve into how these components work together to execute instructions, store data, and retrieve information.

### Processors (CPUs)
Central Processing Units (CPUs) are the brains of computers, responsible for executing instructions and performing calculations. CPUs are designed to process binary instructions, which are the fundamental building blocks of computer programs.

#### How Processors Work:

**Instruction Fetch:** The CPU fetches instructions from memory, typically from RAM. These instructions are stored as binary code.

**Instruction Decode:** The CPU deciphers the fetched instructions, determining the operation to be executed (e.g., addition, subtraction) and the associated operands (data on which the operation will be performed).

**Execution:** The CPU performs the operation specified by the instruction. This may involve data manipulation, arithmetic calculations, or logical operations.

**Memory Access:** If necessary, the CPU retrieves data from or stores data into RAM. Memory access times can significantly impact a computer's overall speed.

**Write-back:** After executing the instruction, the CPU may write the result back to memory or registers.

Modern CPUs consist of multiple cores, allowing them to execute multiple instructions simultaneously (multithreading) and dramatically improving processing power.

### RAM (Random Access Memory)
Random Access Memory (RAM) is a type of volatile memory that provides temporary storage for data and program instructions. Unlike long-term storage devices (e.g., hard drives), RAM stores data only while the computer is powered on.

#### How RAM Works:
Data Storage: RAM is organized into cells or memory locations, each identified by a unique address. Each cell stores a binary value (0 or 1).

**Rapid Access:** RAM is designed for rapid data retrieval. It can be randomly accessed, meaning that any memory location can be read from or written to with equal speed.

**Temporary Storage:** RAM temporarily stores data and program code that the CPU actively uses. This includes the operating system, running applications, and data manipulated during program execution.

**Volatile Nature:** RAM is volatile memory, meaning it loses its data when the computer is powered off or restarted. This characteristic is in contrast to non-volatile storage devices like hard drives, which retain data even when the power is off.

Efficient memory management is crucial for optimal system performance. When RAM is insufficient to hold all active programs and data, the computer may use a portion of the hard drive as virtual memory, although this is significantly slower.

### Hard Drives (HDDs and SSDs)
Hard Drives (HDDs) and Solid-State Drives (SSDs) serve as long-term storage for a computer's data, programs, and files. They are non-volatile, meaning they retain data even when the power is off.

#### How Hard Drives Work:
Data Storage: Data is stored on spinning disks (HDDs) or flash memory chips (SSDs). Each unit of data is stored as magnetic patterns on the surface of the disk or as electrical charges in NAND flash memory cells.

**Data Retrieval:** To access stored data, the hard drive's read/write heads (HDD) or memory controllers (SSD) locate the desired data by moving to the appropriate track or cell.

**Reading and Writing:** The drive reads data by detecting the magnetic field changes (HDD) or electrical charges (SSD) on the storage medium. Writing involves modifying these magnetic patterns or electrical charges.

**Long-Term Storage:** Hard drives are ideal for long-term storage due to their non-volatile nature. They can hold large volumes of data at a relatively low cost per gigabyte.

**Speed Differences:** SSDs are significantly faster than HDDs in terms of data access times. This speed advantage makes SSDs preferred for operating systems and frequently accessed programs.

In summary, processors execute program instructions, RAM provides fast, temporary data storage for active programs, and hard drives offer long-term, non-volatile storage. Together, these components enable computers to process information, run applications, and store data efficiently. Understanding how these components work is fundamental to computer science and technology.

## Understanding Assembly Language
Assembly language is a low-level programming language that serves as a bridge between machine code (binary) and high-level programming languages. In this section, we'll explore how assembly abstracts over binary, the variations of assembly for different processors, and the relationship between computer operating systems and assembly.

### Assembly as an Abstraction over Binary
At the core of any computer's operation is the execution of machine code, which consists of binary instructions that a computer's central processing unit (CPU) can directly understand and execute. However, writing software directly in binary is extremely tedious, error-prone, and challenging for humans. This is where assembly language comes into play.

Assembly language abstracts over binary code by using mnemonics and symbols to represent machine instructions and memory locations. Instead of writing binary sequences, programmers write human-readable instructions, which are then translated into machine code by an assembler.

For example, consider the following x86 assembly instruction and its equivalent machine code:

Assembly (x86):

```assembly
MOV EAX, 42
```

Machine Code (x86):

```
B8 2A 00 00 00
```

The assembly instruction MOV EAX, 42 is easier to understand for a programmer, but the CPU executes the corresponding machine code, which is a sequence of bytes.

### Processor-Specific Assembly
Different computer processors have their own instruction sets and, consequently, their own assembly languages. This means that assembly code written for one type of CPU is not directly compatible with another CPU architecture. Common CPU architectures include x86, ARM, MIPS, and many others.

Programmers must learn the specific assembly language for the target CPU architecture when developing low-level software. While the basic principles of assembly are similar across different architectures (e.g., moving data, performing arithmetic), the exact instructions, syntax, and available registers may vary significantly.

### Relationship with Computer Operating Systems
Assembly language is often used when developing parts of an operating system (OS), device drivers, and embedded systems software. Here's how it relates to computer operating systems:

**Bootstrapping:** The initial code that runs when a computer boots, known as the bootloader, is often written in assembly. It initializes the system and loads the operating system into memory.

**System Calls:** Assembly is used to interact with the kernel of an operating system through system calls. System calls allow high-level programs to request services from the OS, such as file I/O, process management, and network communication. Writing system calls in assembly ensures efficient and direct communication with the OS.

**Device Drivers:** Writing device drivers (software that controls hardware devices) often involves assembly. Device drivers need to interact closely with hardware, and assembly provides fine-grained control over device registers and interrupts.

**Kernel Development:** Low-level parts of an operating system's kernel may be written in assembly for performance reasons and to access hardware directly. However, most of the kernel is written in higher-level languages like C or Rust.

**Embedded Systems:** In embedded systems programming, where memory and processing power are limited, assembly may be used to optimize critical parts of the code.

While assembly is a powerful tool for low-level programming, it is not the primary language for application development due to its complexity and architecture-specific nature. High-level programming languages like C, C++, Java, and Python are typically used for developing applications, while assembly remains essential for tasks that require precise control over hardware or demand maximum performance.

## Higher-Level Languages vs. Assembly: Advantages and Differences
In the realm of computer programming, higher-level languages play a pivotal role in simplifying the process of developing software applications. These languages are designed with the intention of abstracting low-level details and complexities, making it easier for programmers to write, read, and maintain code. This section explores the concept of higher-level languages, their advantages over assembly language, and the key differences between compilation and interpretation.

### What Are Higher-Level Languages?
Higher-level languages are programming languages that provide a high level of abstraction from the hardware and low-level operations of a computer. They offer a more intuitive and human-readable syntax that allows programmers to focus on solving problems rather than managing intricate details of the underlying computer architecture. Examples of higher-level languages include Python, Java, C++, JavaScript, Ruby, and many others.

### Advantages of Higher-Level Languages Over Assembly:
#### 1. Abstraction:
**Simplicity:** Higher-level languages are designed to be more readable and expressive, reducing the complexity of coding. They use natural language constructs and abstractions like functions, classes, and data structures.

**Portability:** Code written in a higher-level language is often platform-independent, as it abstracts away hardware-specific details. It can be executed on various operating systems with minimal modifications.

#### 2. Productivity:
**Faster Development:** Writing code in a higher-level language is typically faster and more efficient than in assembly. Developers can focus on solving problems rather than managing memory or registers.

**Reduced Errors:** Higher-level languages offer built-in error-checking mechanisms, reducing the likelihood of common programming mistakes.

#### 3. Maintainability:
**Ease of Maintenance:** Code written in higher-level languages is easier to read, understand, and maintain. This is particularly important for large and complex projects.

**Modularity:** Higher-level languages support modular programming, allowing developers to break down code into reusable components.

#### 4. Rich Libraries:
**Library Support:** Higher-level languages often have extensive standard libraries and third-party packages that simplify common tasks and provide access to a wide range of functionality.

**Community:** These languages typically have large and active developer communities, offering resources, documentation, and support.

### Compilation vs. Interpretation:
Higher-level languages can be executed through two primary mechanisms: compilation and interpretation.

#### Compilation:
**Process:** In compilation, the entire source code is translated into machine code by a compiler before execution.
**Execution:** The resulting executable file is run directly by the computer's hardware. Compiled code is generally faster in execution.
**Examples:** Languages like C, C++, and Rust are typically compiled.

#### Interpretation:
**Process:** In interpretation, the source code is read and executed line by line by an interpreter.
**Execution:** The interpreter translates and executes code at runtime. Interpreted code is often more portable but may run slower.
**Examples:** Languages like Python, JavaScript, and Ruby are typically interpreted.

Some languages, such as Java, combine both compilation and interpretation. Java source code is compiled into an intermediate bytecode, which is then interpreted by the Java Virtual Machine (JVM).

In conclusion, higher-level languages provide numerous advantages over assembly, including improved abstraction, productivity, maintainability, and access to rich libraries. They simplify the programming process and allow developers to focus on solving problems effectively. Additionally, understanding the distinction between compilation and interpretation helps in choosing the right language for specific use cases.

## Object-Oriented Programming (OOP) vs. Functional Programming (FP) in JavaScript
JavaScript is a versatile language that supports both Object-Oriented Programming (OOP) and Functional Programming (FP) paradigms. Each approach has its own set of principles and benefits. In this section, we'll explore the differences between OOP and FP in JavaScript, along with examples to illustrate these distinctions.

### Object-Oriented Programming (OOP) in JavaScript:

OOP is a programming paradigm that revolves around the concept of objects. In JavaScript, objects are instances of classes or prototypes. OOP promotes the encapsulation of data and behavior into objects, making it easier to model real-world entities. Key OOP principles in JavaScript include:

#### 1. Classes and Constructors:
JavaScript introduced the class syntax in ECMAScript 2015 (ES6) to create class-based objects. Constructors initialize object instances. Here's an example:

```js
class Person {
  constructor(name, age) {
    this.name = name;
    this.age = age;
  }

  greet() {
    console.log(`Hello, my name is ${this.name} and I'm ${this.age} years old.`);
  }
}

const john = new Person('John', 30);
john.greet(); // Output: Hello, my name is John and I'm 30 years old.
```

#### 2. Inheritance:
JavaScript supports inheritance through the extends keyword. Subclasses inherit properties and methods from their parent classes. Here's an example:

```js
class Student extends Person {
  constructor(name, age, grade) {
    super(name, age);
    this.grade = grade;
  }

  study() {
    console.log(`${this.name} is studying hard.`);
  }
}

const alice = new Student('Alice', 25, 'A');
alice.greet(); // Output: Hello, my name is Alice and I'm 25 years old.
alice.study(); // Output: Alice is studying hard.
```

### Functional Programming (FP) in JavaScript:
FP is a programming paradigm that treats computation as the evaluation of mathematical functions. JavaScript is well-suited for functional programming due to its first-class functions and support for higher-order functions. Key FP principles in JavaScript include:

#### 1. Pure Functions:
Functional programming encourages the use of pure functions, which have no side effects and always return the same output for the same input. Here's an example:

```js
function add(a, b) {
  return a + b;
}

const result = add(3, 5); // Result is always 8, regardless of context.
```

#### 2. Higher-Order Functions:
JavaScript allows functions to be passed as arguments to other functions and returned as values. Higher-order functions are a fundamental concept in FP. Here's an example using the map function:

```js
const numbers = [1, 2, 3, 4, 5];
const doubled = numbers.map((num) => num * 2);
// doubled is now [2, 4, 6, 8, 10]
```

#### 3. Immutability:
Functional programming promotes immutability, where data remains unchanged once created. In JavaScript, this can be achieved using methods like map, filter, and reduce.

```js
const numbers = [1, 2, 3, 4, 5];
const doubled = numbers.map((num) => num * 2);
// doubled is [2, 4, 6, 8, 10], and numbers remains unchanged.
```

### Differences and When to Choose:
**State Handling:** OOP often uses mutable state within objects, while FP prefers immutable data. Choose OOP when you need to manage complex state and interactions between objects. Choose FP for predictable, data-driven transformations.

**Abstraction:** OOP focuses on modeling entities and their behaviors. FP emphasizes the composition of functions and data transformations. Choose OOP for modeling real-world entities. Choose FP for data processing and functional transformations.

**Examples:** OOP suits scenarios like building UI components (React) and game development (using classes for entities). FP is ideal for data manipulation, pipelines, and asynchronous operations (using Promise and async/await).