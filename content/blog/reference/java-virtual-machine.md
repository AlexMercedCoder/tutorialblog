---
title: "The Java Virtual Machine"
date: "2023-10-21T23:27:29-04:00"
description: "The Java Virtual Machine (JVM) is an integral part of the Java Runtime Environment (JRE) and serves as the runtime engine for Java applications."
author: "Alex Merced"
tags:
  - reference
---
> This reference guide moved here from DataLakehouse.help, which now focuses on lakehouse procedures.

## What is the JVM?
The Java Virtual Machine (JVM) is an integral part of the Java Runtime Environment (JRE) and serves as the runtime engine for Java applications. It is a virtualized execution environment that allows Java programs to run on a wide range of hardware platforms without modification. The JVM is responsible for interpreting or compiling Java source code into platform-independent bytecode, managing memory, and executing the bytecode on the host system.

### Key functions of the JVM include:

**Loading:** The JVM loads compiled Java bytecode (.class files) from the classpath and verifies its integrity.

**Execution:** It executes Java bytecode instructions using an interpreter or Just-In-Time (JIT) compiler, which translates bytecode into native machine code for improved performance.

**Memory Management:** The JVM manages memory allocation and garbage collection, ensuring efficient memory usage and preventing memory leaks.

**Security:** It enforces Java's security features, such as classloading restrictions and access control, to provide a secure execution environment.

**Platform Independence:** Java applications are written once and can run on any platform with a compatible JVM, making them platform-independent.

**Exception Handling:** The JVM handles exceptions thrown by Java code, allowing developers to write robust error-handling logic.

### What is Java Bytecode?
Java bytecode is an intermediate representation of Java source code that is generated during the compilation process. Instead of being compiled directly into machine code, Java source code is compiled into bytecode, which is executed by the JVM. This bytecode is a set of instructions that can be executed on any platform with a compatible JVM, making Java a "write once, run anywhere" language.

Here's a simple "Hello, World!" program in Java, along with the equivalent bytecode:

#### Java Source Code:

```java
public class HelloWorld {
    public static void main(String[] args) {
        System.out.println("Hello, World!");
    }
}
```

#### Java Bytecode (Simplified):

```yaml
0:   getstatic       #2; //Field java/lang/System.out:Ljava/io/PrintStream;
3:   ldc             #3; //String Hello, World!
5:   invokevirtual   #4; //Method java/io/PrintStream.println:(Ljava/lang/String;)V
8:   return
```

Each line of bytecode represents an instruction that the JVM can execute. In this example, it retrieves the System.out stream, loads the string "Hello, World!" onto the stack, calls the println method, and finally returns.

### What is a JVM Language?

A JVM language is a programming language that is designed to be compiled into Java bytecode and executed on the Java Virtual Machine (JVM). JVM languages leverage the JVM's portability, performance, and robustness while offering alternative syntax and features compared to Java. Some popular JVM languages include:

#### Java
 While not an alternative to Java itself, Java remains the primary language for the JVM. It provides a stable, statically-typed, and object-oriented platform for enterprise applications.

#### Kotlin
 Kotlin is a statically-typed, modern language developed by JetBrains. It offers concise syntax, null safety, and interoperability with Java. Here's a "Hello, World!" program in Kotlin:

```kotlin
fun main() {
    println("Hello, World!")
}
```

#### Scala
 Scala is a hybrid language that combines object-oriented and functional programming features. It is known for its expressiveness and conciseness. Here's a "Hello, World!" program in Scala:

```scala
object HelloWorld {
    def main(args: Array[String]): Unit = {
        println("Hello, World!")
    }
}
```

#### Groovy
 Groovy is a dynamic language that is often used for scripting and automation tasks. It has a Java-like syntax with additional scripting capabilities. Here's a "Hello, World!" program in Groovy:

```groovy
class HelloWorld {
    static void main(String[] args) {
        println("Hello, World!")
    }
}
```

#### Clojure
 Clojure is a Lisp dialect that runs on the JVM. It is a functional programming language known for its immutability and concise code. Here's a "Hello, World!" program in Clojure:

```clojure
(println "Hello, World!")
```

### Why Do Enterprises Tend to Use Java?
Enterprises often choose Java as their primary programming language for several compelling reasons:

**Platform Independence:** Java's "write once, run anywhere" philosophy allows enterprises to develop applications that can run on various platforms without modification. This reduces compatibility issues and development efforts.

**Stability and Reliability:** Java is renowned for its stability and reliability. It offers strong memory management, exception handling, and extensive libraries for building robust applications.

**Security:** Java provides built-in security features, such as sandboxing and access control, making it a trusted choice for applications where security is a priority.

**Large Ecosystem:** The Java ecosystem includes a vast collection of libraries, frameworks, and tools that streamline development. Enterprises can leverage these resources to accelerate software development.

**Strong Community and Support:** Java has a large and active developer community. Enterprises can access a wealth of knowledge, support, and resources to address challenges and stay up-to-date with best practices.

**Scalability:** Java's scalability features, including multi-threading and distributed computing support, make it suitable for building large-scale applications and systems.

**Enterprise-Grade Frameworks:** Java has mature, enterprise-grade frameworks like Spring and Java EE (now Jakarta EE) that simplify the development of complex, scalable, and maintainable applications.

**Longevity:** Java has a long history and continues to evolve. Enterprises can rely on the language's long-term stability and compatibility.

**Interoperability:** Java can easily integrate with other languages and systems, allowing enterprises to connect Java applications with existing infrastructure.

**Performance:** While not always the fastest language, Java offers good performance, especially with Just-In-Time (JIT) compilation and optimizations.

## Basics of JVM Languages

### Java:

#### Compiling and Running a Script:
In Java, scripts are typically written in separate source files and then compiled and executed.

Compile: Use the javac command to compile a Java source file (e.g., MyScript.java):

```bash
javac MyScript.java
```

Run: Execute the compiled class (e.g., MyScript.class) using the java command:

```bash
java MyScript
```

#### Variables:
```java
// Declare and initialize a variable
int myVariable = 42;

// Variable without initialization (must be assigned before use)
String name;
name = "John";
```

#### Conditionals:
```java
int number = 10;

if (number > 5) {
    System.out.println("Number is greater than 5");
} else if (number == 5) {
    System.out.println("Number is equal to 5");
} else {
    System.out.println("Number is less than 5");
}
```

#### Loops:
```java
// For loop
for (int i = 0; i < 5; i++) {
    System.out.println("Iteration " + i);
}

// While loop
int count = 0;
while (count < 3) {
    System.out.println("Count: " + count);
    count++;
}
```

### Kotlin:
#### Compiling and Running a Script:
Kotlin is often used with build tools like Gradle or Maven for projects. For scripting, you can use the Kotlin scripting environment.

Run Script: Use the kotlin command to run a Kotlin script (e.g., MyScript.kts):

```bash
kotlin MyScript.kts
```
#### Variables:
```kotlin
// Declare and initialize a variable
val myVariable = 42

// Mutable variable
var name = "John"
name = "Doe" // Reassignment is allowed for 'var'
```
#### Conditionals:
```kotlin
val number = 10

if (number > 5) {
    println("Number is greater than 5")
} else if (number == 5) {
    println("Number is equal to 5")
} else {
    println("Number is less than 5")
}
```
#### Loops:
```kotlin
// For loop (ranges)
for (i in 0 until 5) {
    println("Iteration $i")
}

// While loop
var count = 0
while (count < 3) {
    println("Count: $count")
    count++
}
```

### Scala:
#### Compiling and Running a Script:
Scala scripts are typically executed directly using the scala command.

Run Script: Execute a Scala script (e.g., MyScript.scala):

```bash
scala MyScript.scala
### Variables:
```scala
// Declare and initialize a variable (immutable)
val myVariable = 42

// Mutable variable
var name = "John"
name = "Doe" // Reassignment is allowed for 'var'
```
#### Conditionals:
```scala
val number = 10

if (number > 5) {
    println("Number is greater than 5")
} else if (number == 5) {
    println("Number is equal to 5")
} else {
    println("Number is less than 5")
}
```
#### Loops:
```scala
// For loop (ranges)
for (i <- 0 until 5) {
    println(s"Iteration $i")
}

// While loop
var count = 0
while (count < 3) {
    println(s"Count: $count")
    count += 1
}
```
### Groovy:
#### Compiling and Running a Script:
Groovy is often used for scripting and can be executed directly.

Run Script: Execute a Groovy script (e.g., MyScript.groovy):

```bash
groovy MyScript.groovy
```
#### Variables:
```groovy
// Declare and initialize a variable
def myVariable = 42

// Variable without type declaration
name = "John"
```
#### Conditionals:
```groovy
def number = 10

if (number > 5) {
    println("Number is greater than 5")
} else if (number == 5) {
    println("Number is equal to 5")
} else {
    println("Number is less than 5")
}
```
#### Loops:
```groovy
// For loop (ranges)
for (i in 0..4) {
    println("Iteration $i")
}

// While loop
def count = 0
while (count < 3) {
    println("Count: $count")
    count++
}
```
### Clojure:
#### Compiling and Running a Script:
Clojure code is often executed within a REPL (Read-Eval-Print Loop) or as part of a Clojure project. There is no need for a separate compilation step for scripts.

Run Script: Use the clojure command to run a Clojure script (e.g., my-script.clj):

```bash
clojure my-script.clj
```
#### Variables:
```clojure
; Declare and initialize a variable
(def my-variable 42)

; Variables in Clojure are typically immutable
(def name "John")
```
#### Conditionals:
```clojure
(def number 10)

(if (> number 5)
  (println "Number is greater than 5")
  (if (= number 5)
    (println "Number is equal to 5")
    (println "Number is less than 5")))
```
#### Loops:
```clojure
; For loop using 'doseq'
(doseq [i (range 5)]
  (println (str "Iteration " i)))

; While loop using recursion
(defn print-count [count]
  (when (< count 3)
    (println (str "Count: " count))
    (recur (inc count))))

(print-count 0)
```
Please note that Clojure favors a functional and immutable style of programming, which influences variable handling and loop constructs. The doseq loop is often used for iterating over sequences.