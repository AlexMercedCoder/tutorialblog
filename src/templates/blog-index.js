import React, { useState, useRef } from "react"
import { Link, graphql } from "gatsby"

import Bio from "../components/bio"
import Layout from "../components/layout"
import Seo from "../components/seo"
import { rhythm } from "../utils/typography"

const BlogIndex = ({ data, location, pageContext }) => {
  const siteTitle = data.site.siteMetadata.title
  const posts = data.allMarkdownRemark.edges
  const { currentPage, numPages } = pageContext
  
  const isFirst = currentPage === 1
  const isLast = currentPage === numPages
  const prevPage = currentPage - 1 === 1 ? "/" : `/page/${currentPage - 1}`
  const nextPage = `/page/${currentPage + 1}`

  const searchRef = useRef(null)
  const [renderedPosts, setRenderedPosts] = useState(posts)

  const search = () => {
    const term = searchRef.current.value
    if (!term) {
        setRenderedPosts(posts);
        return;
    }
    const results = posts.filter(({node}) => {
      return node.frontmatter.title.toLowerCase().includes(term.toLowerCase())
    })
    setRenderedPosts(results)
  }

  return (
    <Layout location={location} title={siteTitle}>
      <Bio />
      <div className="search" style={{ marginBottom: rhythm(1) }}>
        <input 
            type="text" 
            ref={searchRef} 
            placeholder="Search articles..." 
            style={{ padding: '4px', marginRight: '8px' }}
        />
        <button onClick={search}>Search</button>
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

      <nav style={{ display: 'flex', justifyContent: 'space-between', marginTop: rhythm(1) }}>
        {!isFirst && (
            <Link to={prevPage} rel="prev">
            ← Previous Page
            </Link>
        )}
        {!isLast && (
            <Link to={nextPage} rel="next">
            Next Page →
            </Link>
        )}
      </nav>
    </Layout>
  )
}

export default BlogIndex

export const Head = ({ location }) => <Seo title="All posts" pathname={location.pathname} />

export const pageQuery = graphql`
  query blogPageQuery($skip: Int!, $limit: Int!) {
    site {
      siteMetadata {
        title
      }
    }
    allMarkdownRemark(
      sort: { frontmatter: { date: DESC } }
      limit: $limit
      skip: $skip
    ) {
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
