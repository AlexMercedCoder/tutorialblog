---
title: Creating a Bosque Programming Language Dev Environment in 2021
date: "2021-01-18T12:12:03.284Z"
description: Microsoft Exeperimental Language
---

## What is Bosque?

Bosque is a new programming language currently being built by Microsoft, and if you've been following my posts and youtube videos you know I love learning new programming languages (I find seeing what's different and the same fascinating). You can find my articles and videos on most languages at [devNursery.com](https://www.devnursery.com).

A description of Bosque from the [github readme](https://github.com/microsoft/BosqueLanguage)

> The Bosque Programming Language project is a ground up language & tooling co-design effort focused on investigating the theoretical and the practical implications of:

> Explicitly designing a code intermediate representation language (bytecode) that enables deep automated code reasoning and the deployment of next-generation development tools, compilers, and runtime systems.
> Leveraging the power of the intermediate representation to provide a programming language that is both easily accessible to modern developers and that provides a rich set of useful language features for developing high reliability & high performance applications.
> Taking a cloud-development first perspective on programming to address emerging challenges as we move into a distributed cloud development model based around microservices, serverless, and RESTful architectures.

## Trying It Out

So I really wanted to take this language for a spin and apparently, the setup has changed a few times resulting in the directions in the documentation and tutorials I found not quite working as presented so I had to do some digging to finally get it to work which is why I'm writing this guide.

## Overview

While you can install the compiler, I wasn't able to get the z23 library to install correctly to get the compiler to install directly. Luckily, they provide a dockerfile which builds just fine. So there was a few approaches I could take.

- Build the image then run the image mapping it to a local folder with my files then make the files in vscode then switch to a terminal with the image running and run the files... cumbersome

- Even better, VSCode has the "Remote - Container" extension which lets you run a folder inside of a docker container (read the docs, for linux I just needed a recent a version of Docker and Docker Compose installed).

## After installing the extension

Create a folder you want to work out of and copy the docker file from the [Bosque git repository](https://github.com/microsoft/BosqueLanguage) into that folder. Using the command palette (ctrl+shift+p on Linux), select to open a folder in a container. Select the folder and instead of selectinging the nice variety of base containers they have built-in select to use the docker file that is in the folder. Just wait and eventually it builds the image and loads the folder. (Going forward it will turn on and shut off the image when you run this folder, nice!)

## The compile command

I could not find clarity on how to compile code. I know in the most recent docs they referred compiling with a file called exegen.exe, but it would likely be called something else for linux (the dockerfile creates a Linux container) and the file path in the readme didn't match the docker container. I eventually found the compiler here:

```/bosque/impl/bin/runtimes/exegen/exegen.js```

The Compile Command would then be

```node /bosque/impl/bin/runtimes/exegen/exegen.js -o <outputfile> <source>.bsq```

That's a mouthful so I created the following alias in a bash script and I run it every time I open up this folder:

```bash
alias bosque="node /bosque/impl/bin/runtimes/exegen/exegen.js"
```

So now the compile command becomes

```bash
bosque -o <output> <source>.bsq
```

This feels much easier!

## Running your first file

Create a file called helloworld.bsq

```rust
namespace NSMain;  
entrypoint  
function main(): String {  
 return "Hello World";  
}  
```

then compile it

```bash
bosque -o helloworld helloworld.bsq
```

then run the file

```bash
./helloworld
```

## Conclusion

Now you have an environment for working with the Bosque language, also if you haven't used the remote-container extension before, now you know how you can easily generate an environment for any language without installing new software on your system.

