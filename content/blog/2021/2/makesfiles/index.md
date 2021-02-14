---
title: What is a Makefile and how do I use them?
date: "2021-02-14T12:12:03.284Z"
description: Automating all the things
---

## The beauty of scripting and automation

Today is a great world to live in when it comes to scripting and automating tasks in your computing environment. Out of the box of most Unix-based systems you have several tools to write scripts.

- The Bash command line which has its own scripting language
- Perl, while maybe not the first choice for a full-blown application, is a very powerful language for command-line scripting
- Many Unix based systems may already come with some version of Ruby, Python, PHP which can also be used for scripting

Plus so many other fun scripting languages we can add to our system:

- Raku (Formerly Perl 6)
- NodeJS to write scripts in Javascript

With all these great options, I want to talk about Makefiles. Make is a utility on the Unix system for automating a series of terminal commands. These were typically used to help automate the compilation of software which in Languages like C and C++ can require a more complex chain of commands to link dependencies and source code. Although typically used for software compilation can be used to automate all sorts of things.

## The Syntax

To use Make you start by creating a file called Makefile (case sensitive)

```
express:
    npm init -y
    npm install express morgan dotenv
    touch server.js
    mkdir views models views

publish:
    git add .
    git commit -m "ready to publish"
    git push origin master
    npm publish
```

With the above make file we can run either of the chain of terminal commands like so.

```make express```

```make publish```

What if for some reason you wanted to use a different filename other than Makefile, this is doable. Take the following file.

MakeMore
```
website:
    mkdir website
    touch website/index.html
    code website
```

You can then run this file with the following command.

```make website --makefile=MakeMore```

## Conclusion

Hopefully, this helps you understand what Makefiles are how they work, they can be a pretty nifty tool.