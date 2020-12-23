---
title: Svelte after Sapper - The Svelte Ecosystem
date: "2020-12-23T22:12:03.284Z"
description: "Enterprise level frontend framework"
---

## What is the story?

After a recent Svelte conference is was announced the Svelte team will stop working on Sapper (the official Svelte equivalent of Next/Nuxt). The reasons cited were the following:

- The Code Base Was Getting Difficult to Work With
- New Web Technology made it compelling to rebuild.

So, you can continue to use Sapper in its current form but the Svelte Team will be working on a successor currently known as SvelteJS Kit. The goal of this project is to create a unified Svelte template instead of the prior Svelte and Sapper templates that may have been a confusing distinction to newer Svelte devs. This new Svelte template will use Snowpack which is a newer bundler that embraces ES6 modules making for a much faster and pleasant development experience over bundlers like Rollup, Webpack and Parcel.

Right now SvelteJS Kit has not been officially released although you can play with an early version of it, so what should you use for Svelte Projects in the meantime?

- [Svelte JS Kit](https://www.npmjs.com/package/@sveltejs/kit)

## Option 1 - Plain Old Svelte

- OG Svelte: ```npx merced-spinup svelte projectName```

- Svelte with Snowpack: ```npx merced-spinup snowsvelte projectName```

The above commands will spin up a basic Svelte project, but will not have the Server Side Rendering and Static Site Generation features that framework like Sapper had.

## Option 2 - Keep Using Sapper

- Sapper Markdown Blog Template: ```npx merced-spinup sappermarkdown projectName```

Sapper in its current form is a still fine useable framework even if eventually it will grow stale. So if you wanted to create a markdown blog or portfolio website why not use Sapper. I'm sure people will fork the Sapper code and maintain very similar alternatives. The command above will spin-up a template I made for creating Markdown Blogs/Portfolio websites.

## Option 3 - Elder.js

There is a whole world of 3rd party Svelte based frameworks and Elder.JS is a static site generator that promises support at least till 2023-2024. It's currently stable and projection ready.

- ```npx degit Elderjs/template elderjs-app```
- [Elder.Js](https://github.com/Elderjs/elderjs)

## Option 4 - Routify

Routify is framework for client side routing in Svelte with it's own starter template and workflow!

- ```npx @roxi/routify init```
- [Routify](https://routify.dev/)

## Option 5 - Plenti

Plenti is a standalone Static Generator using Svelte for templating.

- [Plenti](https://plenti.co/?ref=madewithsvelte.com)

## Option 6 - JungleJS

A static site generator using GraphQL and Svelte, I imagine this would be the Gatsby/Gridsome equivalent in the Svelte world.

- [JungleJS](https://www.junglejs.org/)

## Option 7 - Celesite

Celestite isn't a SSG but a tool for using Svelte for templating with Crystal based application. If you aren't familiar, Crystal is a compiled typed languages with a syntax VERY similar to Ruby.

- [Celestite](https://github.com/noahlh/celestite)
