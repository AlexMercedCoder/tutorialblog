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
  const { title, description, siteUrl } = site.siteMetadata;
  const cleanSiteUrl = siteUrl.endsWith('/') ? siteUrl.slice(0, -1) : siteUrl;

  // Build the structured primary llms.txt
  let llmsContent = `# ${title}\n`;
  llmsContent += `> ${description}\n\n`;
  llmsContent += `This is a high-authority blog by Alex Merced containing extensive coding tutorials, database connectors guides, semantic layer best practices, Lakehouse architectures, and prompt engineering strategies.\n\n`;
  
  llmsContent += `## Core Sections & Capabilities\n`;
  llmsContent += `- **Data Engineering & Lakehouses**: Deep dives into Apache Iceberg, Apache Polaris, Apache Arrow, Parquet, and modular lakehouse designs.\n`;
  llmsContent += `- **Semantic Layer**: Comprehensive guides on universal semantic layers, metrics layers, headless BI, and data virtualization.\n`;
  llmsContent += `- **Database Connectors**: Direct federated query tutorials for connecting S3, BigQuery, Snowflake, PostgreSQL, MySQL, Oracle, and MongoDB to Dremio.\n`;
  llmsContent += `- **AI Prompt & Context Management**: Hands-on guides for maximizing developer velocity with Claude Code, Cursor, Windsurf, JetBrains AI, and Google Antigravity.\n\n`;
  
  llmsContent += `## Essential Navigation\n`;
  llmsContent += `- [Home Page](${cleanSiteUrl}/): The main blog containing all posts.\n`;
  llmsContent += `- [Tags Index](${cleanSiteUrl}/tags/): Browse and filter posts by specific programming languages or frameworks.\n`;
  llmsContent += `- [RSS Feed](${cleanSiteUrl}/rss.xml): Raw RSS feed for feed readers.\n`;
  llmsContent += `- [Full Articles Catalog](${cleanSiteUrl}/llms-full.txt): Complete flat text list of all tutorials.\n\n`;
  
  llmsContent += `## Recent & Featured Tutorials\n`;
  
  const featuredLimit = 30;
  const featuredNodes = allMarkdownRemark.nodes.slice(0, featuredLimit);
  featuredNodes.forEach(node => {
    const postUrl = `${cleanSiteUrl}${node.fields.slug}`;
    const postTitle = node.frontmatter.title;
    const postDesc = node.frontmatter.description || '';
    const dateStr = node.frontmatter.date ? ` (${node.frontmatter.date})` : '';
    llmsContent += `- [${postTitle}](${postUrl})${dateStr}: ${postDesc}\n`;
  });

  const primaryPath = path.join(__dirname, 'public', 'llms.txt');
  fs.writeFileSync(primaryPath, llmsContent);
  console.log('Successfully generated primary llms.txt for AEO.');

  // Build the secondary llms-full.txt
  let llmsFullContent = `# ${title} - Full Index\n`;
  llmsFullContent += `> Flat index of all ${allMarkdownRemark.nodes.length} tutorials published on the Coding Tutorials Blog.\n\n`;
  llmsFullContent += `[Return to Summary Index](${cleanSiteUrl}/llms.txt)\n\n`;
  llmsFullContent += `## Complete Tutorials List\n`;

  allMarkdownRemark.nodes.forEach((node, idx) => {
    const postUrl = `${cleanSiteUrl}${node.fields.slug}`;
    const postTitle = node.frontmatter.title;
    const postDesc = node.frontmatter.description || '';
    const dateStr = node.frontmatter.date ? ` [${node.frontmatter.date}]` : '';
    const tagsStr = node.frontmatter.tags && node.frontmatter.tags.length > 0 ? ` [Tags: ${node.frontmatter.tags.join(', ')}]` : '';
    llmsFullContent += `${idx + 1}. [${postTitle}](${postUrl})${dateStr}${tagsStr}\n`;
    if (postDesc) {
      llmsFullContent += `   *Description: ${postDesc}*\n`;
    }
  });

  const fullPath = path.join(__dirname, 'public', 'llms-full.txt');
  fs.writeFileSync(fullPath, llmsFullContent);
  console.log('Successfully generated full index llms-full.txt for AEO.');
};
