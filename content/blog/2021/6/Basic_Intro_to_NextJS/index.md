---
title: Basic Intro to NextJS
date: "2021-06-07T12:12:03.284Z"
description: The next generation of Frontend Frameworks
---

Some people will call NextJS a Static Site Generator like GatsbyJS but it's so much more. Essentially NextJS allows you to create an Isomorphic Application, meaning:

- Some parts are statically rendered
- Some parts are client side rendered
- Some parts are server side rendered

Meaning, you can optimize for speed and security static rendering while not giving up all the benefits of rendering on the client and the server for dynamic content. NextJS is built on React but the other frameworks have their equivalents.

| Frontend Framework | Static Site Gen | Isomorphic App |
|--------------------|-----------------|----------------|
| React | Gatsby | NextJS |
| Vue | Gridsome | NuxtJS |
| Svelte | ElderJS | SvelteKit |
| Angular | Scully | Anular Universal |
| SolidJS | NOT YET | NOT YET |

There are lot more features that frameworks for Isomorphic apps bring to the table but how about we just take NextJS for a Spin.

# Pre-Requisites

- NodeJS Installed

# Setup

- Create a new app `npx create-next-app`
- choose an application name
- cd into the new folder for your project

# Routing

NextJS has file based routing, these are the essential rules:

- If a file that export defaults a react component in the pages folder, it automatically becomes a page with a route named after the file.
    * If you have a file pages/cheese.js it would turn into a page at /cheese
    * If you have a file pages/news/june.js it would turn into a page at /news/june
    * If you have a file pages/news/index.js it would turn into a page at /news (index.js files take on their folder name)

- If you export a express style function from a file in the API folder, it becomes a backend route
    * If you have a file pages/api/hey.js it would be available at /api/hey

- If a file has square brackets then it is treated as a URL param
    * If you have a file called `pages/eat/[food].js` it is treated at `/eat/:food`

- To link between different pages, Link components are used

- To get the url param you bring in the useRouter hook

```jsx
// for pages/eat/[food].js
import useRouter from "next/router"

export default function Food() => {
    // Pull out router
    const router = useRouter()
    // Get the param
    const food = router.query.food

    return <h1>{food}</h1>
}
```

- Files can be served statically outside of public folder

- If you export a function getStaticProps and/or getStaticPaths that page will be rendered statically

- KILLER FEATURE: Incremental Static Regeneration, you can set a timer on how often Next should try to regenerate that static page on a user request. Let's say you set it for 20 minutes. No matter how many requests comes it will only regenerate the page on the first request within the 20 minutes allowing dynamic content to dynamic, and speeds to be FAST.

- If you export a function called getServerSideProps that page will be server side rendered and rendered on the server for each request.

## Bottom Line

That's a pretty sweet feature set, no wonder everyone is so excited by frameworks like Next, Nuxt and SvelteKit!
