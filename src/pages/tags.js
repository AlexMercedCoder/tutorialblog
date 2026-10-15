import React from "react"
import PropTypes from "prop-types"
import { Link, graphql } from "gatsby"
import Layout from "../components/layout"
import Seo from "../components/seo"
import { rhythm } from "../utils/typography"

// Same slug function gatsby-node uses to create the tag pages.
import kebabCase from "lodash/kebabCase"

const TagsPage = ({
  data: {
    allMarkdownRemark: { group },
    site: {
      siteMetadata: { title },
    },
  },
  location,
}) => {
    // Tags that differ only in case or punctuation share one page; list it once.
    const bySlug = {}
    group.forEach(tag => {
        const slug = kebabCase(tag.fieldValue)
        if (!slug) return
        if (bySlug[slug]) bySlug[slug].totalCount += tag.totalCount
        else bySlug[slug] = { slug, fieldValue: tag.fieldValue, totalCount: tag.totalCount }
    })
    const tags = Object.values(bySlug).sort((a, b) => a.slug.localeCompare(b.slug))
    return (
        <Layout location={location} title={title}>
        <div>
            <h1>Tags</h1>
            <ul style={{ listStyle: 'none' }}>
            {tags.map(tag => (
                <li key={tag.slug} style={{ marginBottom: rhythm(0.5) }}>
                <Link to={`/tags/${tag.slug}/`}>
                    {tag.fieldValue} ({tag.totalCount})
                </Link>
                </li>
            ))}
            </ul>
        </div>
        </Layout>
    )
}

TagsPage.propTypes = {
  data: PropTypes.shape({
    allMarkdownRemark: PropTypes.shape({
      group: PropTypes.arrayOf(
        PropTypes.shape({
          fieldValue: PropTypes.string.isRequired,
          totalCount: PropTypes.number.isRequired,
        }).isRequired
      ),
    }),
    site: PropTypes.shape({
      siteMetadata: PropTypes.shape({
        title: PropTypes.string.isRequired,
      }),
    }),
  }),
}

export default TagsPage

export const Head = ({ data, location }) => (
  <Seo
    title="All Tags"
    description="Every topic on Coding Tutorials by Alex Merced, from JavaScript, Python and Rust to SQL, data engineering and AI agents, with the post count for each one."
    pathname={location.pathname}
  />
)

export const pageQuery = graphql`
  query {
    site {
      siteMetadata {
        title
      }
    }
    allMarkdownRemark(limit: 2000) {
      group(field: {frontmatter: {tags: SELECT}}) {
        fieldValue
        totalCount
      }
    }
  }
`
