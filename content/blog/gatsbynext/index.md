---
title: Creating a Gatsby or NextJS Markdown Blog
date: "2020-12-05T22:12:03.284Z"
description: Using merced-spinup templates
---

## Why a Markdown Blog

Using a Static Site Generator has many benefits such as:

- Easier to host
- Faster load times
- Better SEO
- More Secure

All of the main frontend frameworks have Static Site Generators associated with them:

- React (NextJS/Gatsby)
- Vue (Nuxt/Gridsome)
- Angular (Scully)
- Svelte (Sapper)

A popular use of Static Site Generators is to create Markdown blogs. These blogs using different libraries do the following...

- Look up a directory of markdown files and generate a slug for each one
- Render the markdown frontmatter (yaml) into a javascript object
- Render the markdown content into a component
- Inject the frontmatter and content into a template to generate a static page for that slug (example: my-example.md becomes /my-example)

I've recently created two templates for the merced-spinup generator for markdown blogs in NextJS and Gatsby.

## NextJS Template

To use the template the command is...

`npx merced-spinup nextmarkdown practice1`

Change directory into the new folder and run `npm install`

### The Markdown

In this template any markdown you want as part of the blog should be put into the markdown folder.

```markdown

---
title: 'Hello, world!'
author: 'Cassidy'
---

Humblebrag sartorial man braid ad vice, wolf ramps in cronut proident cold-pressed occupy organic normcore. Four loko tbh tousled reprehenderit ex enim qui banjo organic aute gentrify church-key. Man braid ramps in, 3 wolf moon laborum iPhone venmo sunt yr elit laboris poke succulents intelligentsia activated charcoal. Gentrify messenger bag hot chicken brooklyn. Seitan four loko art party, ut 8-bit live-edge heirloom. Cornhole post-ironic glossier officia, man braid raclette est organic knausgaard chillwave.

- Look at me
- I am in a list
- Woo hoo

```

The section with the title and author is YAML that is referred to markdown files frontmatter. You can put yaml data you'd like here and you can make use of it in the template. Anything below the frontmatter uses markdown syntax and is considered the content of the markdown file.

### The Individual Post Template

This is the file in /src/mark/[page].md, this will determinate how an individual post is displayed here you can make use of the frontmatter as you like.

```js
import Link from 'next/link'
import matter from 'gray-matter'
import ReactMarkdown from 'react-markdown'

import Layout from '../../components/layout'

export default function BlogPost({ siteTitle, frontmatter, markdownBody }) {
  if (!frontmatter) return <></>

  return (
      <Layout pageTitle={`${siteTitle} | ${frontmatter.title}`}>
        <Link href="/">
          <a>Back to post list</a>
        </Link>
        <article>
          <h1>{frontmatter.title}</h1>
          <p>By {frontmatter.author}</p>
          <div>
            <ReactMarkdown source={markdownBody} />
          </div>
        </article>
      </Layout>
  )
}


//This takes the slug and imports the data from the proper markdown file
export async function getStaticProps({ ...ctx }) {
  const { page } = ctx.params

  const content = await import(`../../markdown/${page}.md`)
  const config = await import(`../../siteconfig.json`)
  const data = matter(content.default)

  return {
    props: {
      siteTitle: config.title,
      frontmatter: data.data,
      markdownBody: data.content,
    },
  }
}


//This creates a slug for each markdown file in the markdown folder
export async function getStaticPaths() {
  const blogSlugs = ((context) => {
    const keys = context.keys()
    const data = keys.map((key, index) => {
      let slug = key.replace(/^.*[\\\/]/, '').slice(0, -3)

      return slug
    })
    return data
  })(require.context('../../markdown', true, /\.md$/))

  const paths = blogSlugs.map((slug) => `/mark/${slug}`)

  return {
    paths,
    fallback: false,
  }
}
```

Things to keep in mind...

- The props returned to the BlogPost component is determined by the return value of getStaticProps, which pulls the markdown file referenced in the slug of the generated page

- the getStaticPaths functions is reading all the markdown files and generating a slug for each one which Next then generates at build time running the getStaticProps individually for each page to be rendered.

### Page Template

To change the appearance of all pages edit the Header and Footer components in the components folder, you can use styles.css in the public folder for styling.

### The Main Page

src/index.js is the main page and the MDList component is the component that lists and links to all the blog posts.

### Scripts

`npm run dev` will run the dev server so you can see the results of your edit
`npm run build` will build the final output for deployment

## Gatsby Markdown Blog

To generate a project

`npx merced-spinup gatsbymarkdown practice1`

cd into the new folder and run `npm install`

### How this works

- In the gatsby-config.js we define gatsby plug-ins, the filesystem plugin system is currently being used to pull images from the images folder and markdown from the markdown folder.

- In the gatsby-node.js folder the onCreateNode checks that when the markdown files are being generated into nodes (Markdown tracks all the data you use queryable nodes) it adds slug field to the node based on the markdowns name.

- Also in gatsby-node the createPages function queries the data from the individual markdown files and then iteratively generates a page for each markdowns slug passing the data into a template found src/layout/MarkPage.js (in case you want to change how each post is displayed). The Layout component is where headers, footers and overall layout can be set for the site.

- the markdown files are in the src/mark folder and work just like they do in nextJS

- pages/index.js is the main page of the site which currently queries all the markdown files and generates a link to each page. Alter this page if you want to change how the list of posts appears.

- styled components is installed and can be used from the src/styles/mainstyles.js file for styling purposes.

### Commands

`npm run develop` runs the dev server for developing

`npm run build` will build the deployable output into a public folder

## Bottom Line

Hopefully this explanation of these templates will give you enough appreciation for them to mold them to fit your needs.