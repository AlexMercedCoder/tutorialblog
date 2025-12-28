import React from "react"
import { Link, graphql } from "gatsby"

import Bio from "../components/bio"
import Layout from "../components/layout"
import Seo from "../components/seo"
import { rhythm } from "../utils/typography"
import { useState, useRef } from "react"
import { render } from "react-dom"

const BlogIndex = ({ data, location }) => {
  const siteTitle = data.site.siteMetadata.title
  const posts = data.allMarkdownRemark.edges

  const searchRef = useRef(null)

  const [renderedPosts, setRenderedPosts] = useState(posts)

  const search = () => {
    const term = searchRef.current.value
    const results = posts.filter(({node}) => {
      return node.frontmatter.title.toLowerCase().includes(term.toLowerCase())
    })
    setRenderedPosts(results)
  }

  return (
    <Layout location={location} title={siteTitle}>
      <Bio />
      <div className="search">
      <input type="text" ref={searchRef} placeholder="search articles"/>
      <button onClick={search}>search</button>
      </div>

      {renderedPosts.map(({ node }) => {
        const title = node.frontmatter.title || node.fields.slug
        return (
          <article key={node.fields.slug}>
            <header>
              <h3
                style={{
                  marginBottom: rhythm(1 / 4),
                }}
              >
                <Link style={{ boxShadow: `none` }} to={node.fields.slug}>
                  {title}
                </Link>
              </h3>
              <small>{node.frontmatter.date}</small>
            </header>
            <section>
              <p
                dangerouslySetInnerHTML={{
                  __html: node.frontmatter.description || node.excerpt,
                }}
              />
            </section>
          </article>
        )
      })}
    </Layout>
  )
}

export default BlogIndex

export const Head = ({ location }) => <Seo title="All posts" pathname={location.pathname} />

export const pageQuery = graphql`
  query {
    site {
      siteMetadata {
        title
      }
    }
    allMarkdownRemark(sort: { frontmatter: { date: DESC } }) {
      edges {
        node {
          excerpt
          fields {
            slug
          }
          frontmatter {
            date(formatString: "MMMM DD, YYYY")
            title
            description
          }
        }
      }
    }
  }
`
