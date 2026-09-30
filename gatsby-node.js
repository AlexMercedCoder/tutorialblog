const path = require(`path`)
const { createFilePath } = require(`gatsby-source-filesystem`)

// Indexed topic hubs with a written intro (alexmerced.blog model).
const TOPIC_INTROS = {
  python: "Python tutorials: virtual environments, web frameworks such as Flask, FastAPI and Masonite, and Python for data work. Check the library versions in each tutorial before running older code.",
  javascript: "JavaScript tutorials and references, from the DOM and promises to functional patterns and sorting algorithms. Older posts show the syntax and tooling that was current when they were written.",
  rust: "Rust tutorials for developers coming from other languages: syntax basics, strings, collections, and building web APIs.",
  "developer-tools": "Posts on the tools developers use day to day: editors, command line utilities, AI coding assistants, and their configuration.",
}

exports.createPages = async ({ graphql, actions }) => {
  const { createPage } = actions

  const blogPost = path.resolve(`./src/templates/blog-post.js`)
  const result = await graphql(
    `
      {
        allMarkdownRemark(
          sort: { frontmatter: { date: DESC } }
          limit: 1000
        ) {
          edges {
            node {
              fields {
                slug
              }
              frontmatter {
                title
                tags
                canonical
              }
            }
          }
        }
      }
    `
  )

  if (result.errors) {
    throw result.errors
  }

  // Create blog posts pages.
  const posts = result.data.allMarkdownRemark.edges

  posts.forEach((post, index) => {
    const previous = index === posts.length - 1 ? null : posts[index + 1].node
    const next = index === 0 ? null : posts[index - 1].node

    const _ = require("lodash");
    const currentTags = post.node.frontmatter.tags || [];

    // Find related posts
    const relatedPosts = posts
        .filter(p => p.node.fields.slug !== post.node.fields.slug) // Exclude current post
        .map(p => {
            const pTags = p.node.frontmatter.tags || [];
            const commonTags = _.intersection(currentTags, pTags);
            return {
                ...p,
                commonTagCount: commonTags.length
            };
        })
        .filter(p => p.commonTagCount > 0) // Must have at least one common tag
        .sort((a, b) => b.commonTagCount - a.commonTagCount) // Sort by most common tags
        .slice(0, 3) // Take top 3
        .map(p => ({
            slug: p.node.fields.slug,
            title: p.node.frontmatter.title,
            date: p.node.frontmatter.date
        }));

    createPage({
      path: post.node.fields.slug,
      component: blogPost,
      context: {
        slug: post.node.fields.slug,
        previous,
        next,
        relatedPosts,
        // Syndicated copies (canonical on another site) stay out of the sitemap.
        sitemapExclude: /^https:\/\//.test(post.node.frontmatter.canonical || ""),
      },
    })
  })

  // Create paginated index pages
  const postsPerPage = 6;
  const numPages = Math.ceil(posts.length / postsPerPage);
  const blogIndex = path.resolve("./src/templates/blog-index.js");

  Array.from({ length: numPages }).forEach((_, i) => {
      createPage({
          path: i === 0 ? `/` : `/page/${i + 1}`,
          component: blogIndex,
          context: {
              limit: postsPerPage,
              skip: i * postsPerPage,
              numPages,
              currentPage: i + 1,
          },
      });
  });

  // Create Tag Pages
  const tagsTemplate = path.resolve("src/templates/tags.js");
  const _ = require("lodash");

  let tags = [];
  // Iterate through each post, putting all found tags into `tags`
  posts.forEach(edge => {
    if (_.get(edge, "node.frontmatter.tags")) {
      tags = tags.concat(edge.node.frontmatter.tags)
    }
  })
  // Count posts per tag page path before de-duplicating
  const tagCounts = _.countBy(tags, t => _.kebabCase(t))
  // Eliminate duplicate tags
  tags = _.uniq(tags)

  // Make tag pages. Tags with fewer than 5 posts are thin: noindex and left
  // out of the sitemap. Topic hubs in TOPIC_INTROS get a written intro.
  const seen = new Set()
  tags.forEach(tag => {
    const slug = _.kebabCase(tag)
    if (seen.has(slug)) return
    seen.add(slug)
    const count = tagCounts[slug] || 0
    createPage({
      path: `/tags/${slug}/`,
      component: tagsTemplate,
      context: {
        tag,
        count,
        intro: TOPIC_INTROS[slug] || null,
        noindex: count < 5,
        sitemapExclude: count < 5,
      },
    })
  })
}

exports.onCreateNode = ({ node, actions, getNode }) => {
  const { createNodeField } = actions

  if (node.internal.type === `MarkdownRemark`) {
    const value = createFilePath({ node, getNode })
    createNodeField({
      name: `slug`,
      node,
      value,
    })
  }
}

exports.onPostBuild = async ({ graphql }) => {
  const fs = require('fs');
  const path = require('path');
  const result = await graphql(`
    {
      site {
        siteMetadata {
          title
          description
          siteUrl
        }
      }
      allMarkdownRemark(sort: { frontmatter: { date: DESC } }, limit: 1000) {
        nodes {
          fields {
            slug
          }
          frontmatter {
            title
            description
            date(formatString: "MMMM DD, YYYY")
            tags
            canonical
          }
        }
      }
    }
  `);

  if (result.errors) {
    console.error("Error generating llms.txt", result.errors);
    return;
  }

  const { site, allMarkdownRemark } = result.data;
  const { title, siteUrl } = site.siteMetadata;
  const cleanSiteUrl = siteUrl.endsWith('/') ? siteUrl.slice(0, -1) : siteUrl;
  const nodes = allMarkdownRemark.nodes;
  const isHttps = u => /^https:\/\/\S+$/.test(u || '');
  // Netlify serves lowercase paths, so list the URL that answers 200.
  const ownUrl = node => `${cleanSiteUrl}${encodeURI(decodeURI(node.fields.slug).toLowerCase())}`;
  const urlFor = node => (isHttps(node.frontmatter.canonical) ? node.frontmatter.canonical : ownUrl(node));
  const line = node => {
    const d = node.frontmatter.description ? `: ${String(node.frontmatter.description).replace(/\s+/g, ' ').trim()}` : '';
    const date = node.frontmatter.date ? ` (${node.frontmatter.date})` : '';
    return `- [${node.frontmatter.title}](${urlFor(node)})${date}${d}`;
  };
  const masters = nodes.filter(n => !isHttps(n.frontmatter.canonical));
  const copies = nodes.filter(n => isHttps(n.frontmatter.canonical));

  const header = `# ${title}
> Hands-on programming tutorials by Alex Merced, mostly written between 2020 and 2024: JavaScript and TypeScript, React, Vue, Svelte, Angular, Node.js with Express, Koa and Fastify, Deno, Python with Flask, FastAPI, Django and Masonite, Ruby on Rails and Sinatra, Go, Rust, PHP, databases, and deployment. Older tutorials show the library versions that were current when they were written; where a tutorial states its versions, a "Last tested with" line at the top says so.

This site also carries syndicated copies of Alex Merced's data lakehouse and AI articles. Each copy declares its canonical home with rel=canonical: Alex Merced's Lakehouse Blog (iceberglakehouse.com) or Data Lakehouse Hub (datalakehousehub.com). New data and AI articles are no longer published here.

Author: Alex Merced, Head of Developer Relations at Dremio (https://alexmerced.com)
`;

  let llmsContent = header + `
## Navigation
- [All tutorials](${cleanSiteUrl}/)
- [Topics](${cleanSiteUrl}/tags/)
${Object.keys(TOPIC_INTROS).map(t => `- [${t} tutorials](${cleanSiteUrl}/tags/${t}/): ${TOPIC_INTROS[t]}`).join('\n')}
- [RSS feed](${cleanSiteUrl}/rss.xml)
- [llms-full.txt](${cleanSiteUrl}/llms-full.txt): every post on this site, including syndicated copies with their canonical URLs

## Tutorials whose canonical home is this site (${masters.length}), newest first
${masters.map(line).join('\n')}
`;
  fs.writeFileSync(path.join(__dirname, 'public', 'llms.txt'), llmsContent);
  console.log('Successfully generated llms.txt.');

  const llmsFullContent = header + `
## Tutorials whose canonical home is this site (${masters.length}), newest first
${masters.map(line).join('\n')}

## Syndicated data and AI articles (${copies.length}); links point to the canonical copy
${copies.map(line).join('\n')}
`;
  fs.writeFileSync(path.join(__dirname, 'public', 'llms-full.txt'), llmsFullContent);
  console.log('Successfully generated llms-full.txt.');

  // Generate OG images
  try {
    const { execSync } = require('child_process');
    execSync('node scripts/generate-og-images.mjs', { stdio: 'inherit' });
  } catch (err) {
    console.error('OG image generation failed:', err.message);
  }
};

exports.createSchemaCustomization = ({ actions }) => {
  const { createTypes } = actions;
  createTypes(`
    type MarkdownRemark implements Node {
      frontmatter: Frontmatter
    }
    type Frontmatter {
      title: String
      description: String
      date: Date @dateformat
      tags: [String]
      category: String
      author: String
      canonical: String
    }
  `);
};

