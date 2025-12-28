import React from "react"
import { Link, graphql } from "gatsby"

import Bio from "../components/bio"
import Layout from "../components/layout"
import Seo from "../components/seo"
import { rhythm, scale } from "../utils/typography"

import Share from "../components/share"

const BlogPostTemplate = ({ data, pageContext, location }) => {
  const post = data.markdownRemark
  const siteTitle = data.site.siteMetadata.title
  const twitterHandle = data.site.siteMetadata.social.twitter
  const { previous, next } = pageContext
  const url = `${data.site.siteMetadata.siteUrl}${location.pathname}`;

  return (
    <Layout location={location} title={siteTitle}>
      <article>
        <header>
          <h1
            style={{
              marginTop: rhythm(1),
              marginBottom: 0,
            }}
          >
            {post.frontmatter.title}
          </h1>
          <p
            style={{
              ...scale(-1 / 5),
              display: `block`,
              marginBottom: rhythm(1),
            }}
          >
            {post.frontmatter.date} • {post.fields.readingTime.text}
          </p>
        </header>
        {post.tableOfContents && (
          <details style={{ marginBottom: rhythm(1), background: "#f9f9f9", padding: "10px", borderRadius: "5px" }}>
              <summary style={{ cursor: "pointer", fontWeight: "bold" }}>Table of Contents</summary>
              <div dangerouslySetInnerHTML={{ __html: post.tableOfContents }} />
          </details>
        )}
        <section dangerouslySetInnerHTML={{ __html: post.html }} />
        {post.frontmatter.tags && (
            <div style={{ marginTop: rhythm(1), marginBottom: rhythm(1) }}>
                <ul style={{ listStyle: 'none', display: 'flex', flexWrap: 'wrap', padding: 0 }}>
                    {post.frontmatter.tags.map(tag => {
                        const _ = require("lodash");
                        return (
                            <li key={tag} style={{ marginRight: '10px' }}>
                                <Link to={`/tags/${_.kebabCase(tag)}/`}>#{tag}</Link>
                            </li>
                        )
                    })}
                </ul>
            </div>
        )}
        <Share title={post.frontmatter.title} url={url} twitterHandle={twitterHandle} />
        <hr
          style={{
            marginBottom: rhythm(1),
          }}
        />
        <footer>
          <Bio />
        </footer>
      </article>

      <nav>
        <ul
          style={{
            display: `flex`,
            flexWrap: `wrap`,
            justifyContent: `space-between`,
            listStyle: `none`,
            padding: 0,
          }}
        >
          <li>
            {previous && (
              <Link to={previous.fields.slug} rel="prev">
                ← {previous.frontmatter.title}
              </Link>
            )}
          </li>
          <li>
            {next && (
              <Link to={next.fields.slug} rel="next">
                {next.frontmatter.title} →
              </Link>
            )}
          </li>
        </ul>
      </nav>
    </Layout>
  )
}

export const Head = ({ data, location }) => {
  const post = data.markdownRemark
  return (
    <Seo
      title={post.frontmatter.title}
      description={post.frontmatter.description || post.excerpt}
      pathname={location.pathname}
      image={post.frontmatter.bannerImage}
      article={true}
    />
  )
}

export default BlogPostTemplate

export const pageQuery = graphql`
  query BlogPostBySlug($slug: String!) {
    site {
      siteMetadata {
        title
        siteUrl
        social {
          twitter
        }
      }
    }
    markdownRemark(fields: { slug: { eq: $slug } }) {
      id
      excerpt(pruneLength: 160)
      html
      tableOfContents(absolute: false, maxDepth: 3)
      fields {
        readingTime {
          text
        }
      }
      frontmatter {
        title
        date(formatString: "MMMM DD, YYYY")
        description
        bannerImage
        tags
      }
    }
  }
`
