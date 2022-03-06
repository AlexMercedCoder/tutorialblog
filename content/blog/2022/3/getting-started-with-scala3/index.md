---
title: Getting Started with Scala 3
date: "2022-03-06T12:12:03.284Z"
description: Powerful Functional & OOP JVM Language
---

## Why Scala 3

Scala 3 is a popular Functional and OOP language that runs on the Java Virtual Machine. It's most popular for use with the Spark Data Processing framework for data engineering work but is a powerful language that can be used for anything including data analytics and web development (Play, Akka) and much more.

The release of Scala 3 brought Scala a much cleaner python like Syntax and simplified some of it's most unique features (such as swapping out implicits for givens). As libraries update to support Scala 3, this new syntax will likely bring in a lot of new adoption into this unique language. In this video whether you've ever used Scala 2 or not, we introduce you to the world of scala 3.

## Getting Started

- Install Java 8, 11 or 17 for your operating system (google how for your OS)
- Install [Cousier](https://get-coursier.io/docs/sbt-coursier)
- Use coursier to install scala3 and scala3compiler
    - `cs install scala3`
    - `cs install scala3-compiler`
    - `cs install sbt`
- Install the metals extension on VSCode

## Hello World

SBT stands for the Scala Built Tool, so it's used to help build application in scala. To start a new Scala 3 application use the following command.

`sbt new scala/scala3.g8`

This will prompt you for a project name and it will create a folder with that project, open it up in VSCode and approve importing the build.

In the project folder you should see a build like this:

```
- project (sbt uses this for its own files)
        - build.properties
- build.sbt (sbt's build definition file, like package.json for node)
- src
    - main
        - scala (all of your Scala code goes here)
            - Main.scala (Entry point of program)
```

When you first create the project you'll see the following in the build.sbt, sbt uses a dialect of Scala for defining the build.

```scala
// what version of scala
val scala3Version = "3.1.1"

// describes the details of your project
lazy val root = project
  .in(file("."))
  .settings(
    name := "project1",
    version := "0.1.0-SNAPSHOT",

    scalaVersion := scala3Version,

    // how 3rd party libraries are added, get code from library on scaladex
    libraryDependencies += "com.github.sbt" % "junit-interface" % "0.13.3" % Test
  )
```

All your code will go in src, there is the main module which you can find in src/main/scala/Main.scala which is a hello world program.

```scala
// Annotation for defining the main function (program entrypoint)
@main def hello: Unit = 
  // like python, blocks are denoted by tabs
  println("cheese")
  println(msg)

def msg = "I was compiled by Scala 3. :)"
```

We can run this file by running the command `sbt` int he same folder with the `build.sbt` then just running the command `run`. If you want the code to auto-run anytime the code changes you can do `~run`.

## Declaring Variables

`var` is used to declare mutable variables
`val` is used to declare immutable variables

Type can be inferred unless you aren't immediately assigning a value then you need a type.

```scala
import scala.compiletime.ops.string

@main def hello: Unit = 
  val cheese1: String = "Munster"
  var cheese2: String = "Gouda"

  println(cheese1)
  println(cheese2)

  cheese2 = "Swiss"
  println(cheese2)
```

Other basics:
- multiline strings can be denoted with `"""`
- String Interpolation can be done like so `s"The result is: ${x + y}"`

## Control Flow

If Statement

```scala
if x == "Bob" then
  println("It's Bob")
else if x == "Steve" then
  println("it's steve")
else
  println("I don't know you!")
```

If Expression

```scala

val to_be = if be == true then true else false

```

For Loops
```scala
val buddies = List("Joe", "Ira", "Arthur")

for bud <- buddies do println(bud)
```

You can have conditional guards applied to these loops, so some loops won't run.

Loop Expression

```scala
@main def hello: Unit = 
  val buddies = List("Joe", "Ira", "Arthur", "Alex")

  val children: List[String] = for b <- buddies yield b + " jr."

  for c <- children do println(c)
```

## Conclusion

You can learn more by reading the Scala 3 [here](https://docs.scala-lang.org/scala3/book/taste-control-structures.html)

You can find 3rd party scala libraries on [ScalaDex](https://index.scala-lang.org/)

Take Scala 3 out for a spin!