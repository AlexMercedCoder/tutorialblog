---
title: Go/Golang 101 - The Syntax and Basics
date: "2021-04-01T12:12:03.284Z"
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

In this article, I want to discuss GO and getting started with GO.

## Installing GO

GO doesn't seem to have a tool like pyenv or rbenv quite yet, but to install GO just follow the instruction here.

- [Install GO Directions](https://golang.org/doc/install)

To update your GO install in the future, this bash script makes the process super easy.

- [Update Go Bash Script](https://github.com/udhos/update-golang)

## The GOROOT

Originally, to write GO code you'd have to write the code in a particular directory called your GOROOT (you can see what your go root is by logging the GOROOT environment variable in your terminal). If you wanted to write GO code elsewhere you'd have to add that directory to an environment variable called GOPATH.

In newer versions of GO you can write GO code anywhere and run the file with the command.

```bash
go run filename.go
```

Go files have a ".go" extension.

## Package Management

There are several awesome Go libraries in the Go ecosystem and in the early days there wasn't a built-in method for package management although now modules are a built-in feature. 

So in a folder for your new project run the following command.

```
go mod init myproject.com/projectname
```

This will create a go.mod file which is similar to your package.json or Gemfile

To run the project so all the files are read using the following command.

```bash
go run .
```

This will read all the files in the current directory before running the file.

To import other libraries run `go get libraryNAME`

When done with your project and wanting to compile it to an executable file, you just run `go build`, run `go help build` to learn more about the command syntax.

## Your first Go file

In your folder create a main.go that looks like this.

```go

package main

import "fmt"

func main (){
    fmt.Println("Hello World")
}

```

So let's break this down

- package refers to the collective name of all the go files in the same directory. So any other files should have the same package in the name. If you created more files in subdirectories they should get a package name that matches the name of the directory.

- import allows you to import other libraries. fmt is part of the standard set of go library for logging text to the terminal.

- The main function like most compiled languages is where your software begins. The compiler essentially treats the main function as what is invoked when the program is run after compilation, so the order things will happen will depend on the main function, there should only be ONE main function.

- notice that Println in fmt.Println is capitalized. The way go handles exports is through capitalization. Any variable, type or function that is capitalized can be used in other files, if lowercase it can't. So in the fmt library, there is a function defined called Println and since it is named with uppercase we can import and use it. Using members of libraries always has the syntax of "library.Member".

- run the file with `go run .` and make sure hello world is logged.

## Second File

Let's make a hw.go file in the same directory with the following:

```go
package main

// Hello World in a variable
var Hello string = "hello world"
```

Notice this file is also in the main package cause it is in the same directory. In this file, we've declared a variable.

- var is the keyword to declare a variable

- Hello is the name of the variable, since it's capitalized it is exported and usable in other files of the package

- string is the type of data Hello will hold, we must type our variables when using the var keyword.

- = is the assignment operator stating the value on the right should be stored on the variable on the left

- "hello world" is the string value we are storing in the variable

Since we exported this value we can now use it in our main.go!

main.go
```go
package main

import "fmt"

func main (){
    fmt.Println(Hello)
}
```

Now run the project with `go run .` and it should work, but if you try `go run main.go` it will fail cause it won't look for the other files.

## More Files

Create a new folder called more with a file called stuff.go and enter the following:

```go

package more

var More string = "More Stuff"

```

Since this is in a sub-folder we have to import it to use it in our main.go.

```go
package main

import (
	"fmt"
	"myproject.com/projectname/more"
)

func main (){
	fmt.Println(Hello)
	fmt.Println(more.More)
}
```

In our import, the subfolder/package name is prefixed by our module name (you can refer to your go.mod if not sure what that is). Now that it is import we can use the exported members of any of the files in the more folder via more.Member.

## The Walrus Operator

A nice feature in go is there is a way to opt-out of declaring the type of a variable by using the walrus operator which has two requirements:

- must be used in a function (main counts)
- must assign a value right away, as the type is implied by the assigned value

add the following in more/stuff.go

```go

package more

var More string = "More Stuff"

func Stuff() string {
	
	mystring := "My Type is Implied"
	
	return mystring
}

```

Here we have declared a function called Stuff. The word string after the parenthesis declares what value the function should return, in this case, a string. Notice we declare a mystring variable without the var keyword and give it a value immediately with the Walrus operator, we then return that variable.

Now add the following to main.go

main.go
```go
package main

import (
	"fmt"
	"am/am/more"
)

func main (){
	fmt.Println(Hello)
	fmt.Println(more.More)
	fmt.Println(more.Stuff())
}
```

We then use the Stuff function, which passes its returned value to the Println function. Run `go run .` and see the result!

## Conclusion

Hopefully, this has helped you get used to how to setup and use go, in future articles I'll cover more advanced topics like structs, functions, etc. So make sure to keep checking in here at AlexMercedCoder.com for more articles!