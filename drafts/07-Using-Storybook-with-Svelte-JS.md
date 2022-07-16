---
title: Using Storybook with SvelteJS
date: "2022-07-16"
description: "Making Testing your components in Isolation Easy"
author: "Alex Merced"
category: "frontend"
bannerImage: "/images/postbanner/2022/batch-streaming.png"
tags:
  - frontend
  - svelte
  - testing
---

When working with Frontend frameworks like Svelte, React, Vue, Angular, SolidJS, RiotJS, Lit, and more it can frustrating testing your components in Isolation, especially when they have many possible states. Storybook is a framework to make testing and documenting your components a breeze. Let's demonstrate how to use Storybook with SvelteJS in this article.

## Setup

- must have node installed
- create a new svelte project with `npm init vite`
- cd into the folder with your new project
- scaffold Storybook with `npx storybook init`

When you scaffold storybook it will detect which framework you are working with, so pretty much the same process with any supported framework (React, Vue, Angular, Svelte, Preact, Ember, Web Components)

We can then check that Storybook is working with the command `npm run storybook`, explore the dashboard it will open up, this is the key benefit of Storybook.

## Creating a Button Component

We are going to demonstrate the whole process so you can delete all the .svelte, .js and .css files in the `src/stories`, then create a new Button.svelte in `src/components/Button`