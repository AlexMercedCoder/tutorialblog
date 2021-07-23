---
title: The Concepts of JAMStack 101
date: "2021-07-11T12:12:03.284Z"
description: Speed, SEO and Security with JAMStack
---

JAMStack is a set of technologies to create fast, SEO friendly, and secure websites. To really appreciate what these set of technologies provide us (Static Site Generators and Headless CMS's) let's discuss the evolution of web development.

## In the beginning 

In the not to distant old days every aspect of a webpage was crafted by the web developer. The structure, the design and the content. So each page of each website required a developer assemble. If any of the content, design or structure change it fell on the developer to make that change to each and every page on the website. Really quickly we can see why this would be tedious and unproductive for large data heavy websites.

## Server Side Rendering

The next step in the evolution were dynamically rendering our html/css using templating libraries or languages (EJS, PHP, Jinja, ERB, Blade, etc.). The way these would work is the web server instead of delivering a pre-made HTML file would be passed some data along with a template and generate the html file before responding to the request from the clients/users browser. So I could create one template that can be used to generate a page for every product in a store for example and to the user it would seem as if we had handcrafted a page for every website.

Overtime, this started showing some flaws. Having your web server render templates means more work for your server meaning more costs in scaling not only for your server but your database. On top of this, making sure all your interactivity could get complex having to create server side templates then attach separate javascript files for your client side interactivity.

## The Single Page Application

Instead of all the data existing on the server be rendered into a text html files, the idea of shifting more of the work onto the users computer (taking data and rendering it) with frameworks like Backbone and Knockout and really took to the mainstream with Google's Angular, Facebook's React, Vue, Svelte and the newest entrant, SolidJS. These frameworks introduced the idea of a SPA (Single Page Application). 

Instead of a server rendering each page as needed for every request, the user would just make a single request and download the entire frontend application upfront. The visual would be dynamically rendered based on changing data fetched behind the scenes from one or many JSON APIs. The Benefits of SPAs:

- The visual is mostly rendered in the browser, offloading the rendering process on the client instead of the server.

- The frontend application is much cheaper to host and scale, and often hosted separately than the API in which it pulls data from.

- Offered a very snappy and fast user experience.

With some downsides:

- Adding some of your stateful logic to the client allows those who know how to manipulate and exploit APIs that don't take the right security measures.

- Since the site isn't rendered till after it has been downloaded by the client, most of the text Search Engines would crawl gets ignored.

## Enter Static Site Generators

Static Sites, the sites made purely from plain html/css/js are by far the fastest, most secure and most search engine friendly but writing pages for large blocks of data was too time consuming to dynamically generating on the server or client became the norm.

Suddenly a new class of platform arrived that allowed to build static sites dynamically. Instead of waiting for the user to go to the website to generate the page, you would write out all your templates and logic and the platform would generate all the possible html pages for website, these are known as static site generators.

At first it was dominated by the Ruby based Jekyll, Go Based Hugo and the Python based Hyde. (See a full list at JAMStack.org)

Later on people created robust static site generators on top of the major client side frameworks:

- Angular => Scully
- React => Gatsby
- Vue => Gridsome
- Svelte => JungleJS, Plenti
- SolidJS => None Yet

These all primarily focused on purely static generated content. Although, there were times a server side or client side render may be worthwhile (with data that changes very regularly), so a newer class of frameworks of "All the Above" hit the scene.

- Angular => Angular Universal
- React => NextJS
- Vue => NuxtJS
- Svelte => SvelteKit, ElderJS
- SolidJS => None Yet

## In Summary

With these Static Site Generators your website generation goes through a build process before you deploy that...

- Gathers data from all your sources
- Uses the data to render all the possible pages from your templates

The benefits

- Since pages are already rendered, they load quick and leave a light footprint on the server
- Since they contain little to no javascript, little to no security issues
- Since all the content is already in the file, they are great for SEO purposes

## Headless CMS

This JAMStack approach became very popular with freelancers building websites for clients who had products where SEO was a priority. The problem, is many clients love using wordpress cause of the visual dashboard for managing their site. To fill this gap, the concept of a headless CMS came to light.

Headless CMS: A visual dashboard to manage data and resources that is delivered via an API instead of tied into server side generated templates like traditional CMSs like Wordpress and Drupal.

So now a client can generate all their data on a visual dashboard that can be pulled into the static site generator of your choice via its API generating a fast SEO friendly static site.

Contentful, ButterCMS, AgilityCMS, GraphCMS, Sanity.io are all big names in the hosted Headless CMS space alongside self-hosted platforms like Strapi, Hasura and Prisma.

See a full list of Headless CMS platforms at JAMStack.org.

## In Conclusion

Who would of expected the original way of crafting websites with html/css/js would still be the fastest way to do things. What was old becomes new again with new tools like Static Site Generators and Headless CMSs. Hopefully this article helps make the JAMStack trend clearer.