---
tags:
  - "software development"
author: "Alex Merced"
title: "How to effectively learn software development"
date: "2023-10-15T12:12:03.284Z"
category: "software development"
bannerImage: "https://i.imgur.com/no75OFq.png"
---

# Getting Started

Of course the first step in learning software development is to pick an initial language (I recommend Javascript, Python, Ruby or PHP for your first language) and start learning by:

- downloading and installing the language
- learning the languages syntax in this order:
  - How to print output to the console, and how to run your file.
  - How to create, use and modify variables
  - the languages data types and operators
  - conditionals like if statements
  - loops like while and for loops
  - indexed and key/value based collections
  - how to work with strings
  - how to write and use functions
  - learn version control with git to be able collaborate with your code

You can get started on these initial steps for free by:
- [Using the Resources I created at devNursery](https://www.devnursery.com)
- [Trying out General Assembly's Dash Course](https://dash.generalassemb.ly)
- [Using Free Code Camps free Self-Guided Courses](https://www.freecodecamp.org)

## Early Stage Practicing

In the early stages your goal is to:
- get used to the languages syntax and abstractions
- breaking down simple problems programatically (think of a problem, think through the solution logically, then translate the logic to code)

The best way to do this is with code challenges, but a typical mistake is people rush to do complex or harder code challenges thinking somehow "they'll learn faster" which often results in frustration and set backs. You'll actually learn the more from the simple easy code challenges as concepts are more isolated and clear.

Think of it this way:

- Simple and Easy to learn
- Hard and Complex to improve your ability to apply 
(so if you don't understand the code your writing, application isn't yet your issue)

There are no shortcuts, if you rush to more advanced material you will progress slower than if you learn incrementally and learn how to apply what you learn progressively (piece by piece).

A good way to know whether you understand the code you are writing is commenting each line with an explanation of what the purpose of that line of code is doing. If you can't comment every line in something simple, you shouldn't be building something more complex but instead learning to comprehend what you've already built.

# The Next Phase

The next phase is often to begin building applications and my favorite tool for this phase is a todo list. It's an application that's simple enough, but can become as complex as you like. Don't rush to build the most complex variation, follow the path below to incrementally learn different ways to build the same app which you can apply to any app you want to build.

Some terms and how I mean them:
- Frontend (HTML/CSS/JAVASCRIPT app UI in browser)
- Backend (JSON API in the language of your choice)
- CRUD (Ability to Create, Read, Update, Delete)
- in-memory (not using a database, so data resets every time the app is turned off and on)
- authentication (user signup/login)

1. Build a frontend only Todo list with full CRUD on your todos, data saved in-memory.

2. Build a frontend only Todo list using localStorage to save data

3. Build a full crud backend JSON API (in-memory) for Todos and frontend that interacts with that API (no authentication).

4. Build Backend API with a database, with frontend, no auth.

5. Build a backend API with a database and auth

6. Build API, Frontend, Auth but now you can create categories and associate todos with different categories

7. Build API, frontend, auth, but you can create categories you can share with other users for joint todo lists.

Notice we just keep rebuilding the same todo app from scratch each time incrementally more complicated. Each iteration you should aim to understand how all the pieces fit together before going to attempt the next one. After awhile the pieces and patterns become clearer and clearer.

You can continue to switch it up, on different iterations you can mix it up with:
- different language or framework on the backend
- create a GraphQL or RPC API instead
- use frontend framework like React, Vue, Angualr, Qwik, SolidJS or Svelte
- Implement caching techniques

By creating the same Todo app over and over again but each time with some new twist, you are controlling what you know and you don't know so what you will learn is isolated and easy to see.

