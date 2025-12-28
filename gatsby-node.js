const path = require(`path`)
const { createFilePath } = require(`gatsby-source-filesystem`)

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
  // Eliminate duplicate tags
  tags = _.uniq(tags)

  // Make tag pages
  tags.forEach(tag => {
    createPage({
      path: `/tags/${_.kebabCase(tag)}/`,
      component: tagsTemplate,
      context: {
        tag,
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
