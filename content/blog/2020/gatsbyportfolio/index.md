---
title: Create Your Dev Portfolio with this Gatsby Template
date: "2020-12-30T24:12:03.284Z"
description: Template designed for Dev Portfolios
---

## create-markdown-blog

I recently created a tool called, "create-markdown-blog", that allows you to generate a markdown blog with Gatsby, Next, Nuxt, Sapper, Scully, and Gridsome. I encouraged using it as a starting place for a developer portfolio because a markdown blog offers many benefits to a developer.

- Practice writing markdown
- Posts also count as GitHub commits for GitHub heatmap
- Better SEO and Speed from Static Site Generation

Although a developer portfolio could also use a page to display development projects so I have made a new template that has a little more built-in with the developer in mind.

- some initial styling to get you started (still bare-bones, so it's easy to work in your style without having to fight pre-existing styling)

- gatsby offline plugin so the site works offline and qualifies as PWA

- JSON file for listing information about your projects with a page that renders data from JSON file

## How to use it

1. Create a copy of the template

```bash
npx create-markdown-blog gatsbyportfolio portfolio
```

2. Head over to the src/json/portfolio.json and enter the data of your projects

3. Head over to src/mark and edit the existing blog post, copy and paste this file to make new blog posts

4. Edit src/pages/index.js to edit the main page

5. src/layout/Layout.js is where the header and footer and the overall template is designed

6. You can style the page using styled-components out of src/styles or with CSS using src/styles.css

7. deploy to Netlify and set the build command to "gatsby build" and the publish directory as "public"

8. You now have a portfolio website ready to go!