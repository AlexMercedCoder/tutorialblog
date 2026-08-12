import React, { useMemo, useState } from "react"
import { Link, graphql } from "gatsby"
import kebabCase from "lodash/kebabCase"

import Layout from "../components/layout"
import Seo from "../components/seo"

/**
 * Tags in the archive are inconsistently cased ("data lakehouse" vs
 * "Data Lakehouse"), and both slugify to the same page. Merge them by slug and
 * show the most frequent spelling so the topic grid does not list near
 * duplicates.
 */
function mergeTags(group) {
  const bySlug = new Map()
  group.forEach(({ fieldValue, totalCount }) => {
    if (!fieldValue) return
    const slug = kebabCase(fieldValue)
    const caps = (fieldValue.match(/[A-Z]/g) || []).length
    const existing = bySlug.get(slug)
    if (existing) {
      existing.total += totalCount
      // Prefer the best-cased spelling ("Apache Iceberg" over "apache
      // iceberg"), falling back to the most common one when they tie.
      if (caps > existing.caps || (caps === existing.caps && totalCount > existing.topCount)) {
        existing.label = fieldValue
        existing.caps = caps
        existing.topCount = totalCount
      }
    } else {
      bySlug.set(slug, {
        slug,
        label: fieldValue,
        total: totalCount,
        topCount: totalCount,
        caps,
      })
    }
  })
  return [...bySlug.values()].sort((a, b) => b.total - a.total)
}

const BlogIndex = ({ data, location, pageContext }) => {
  const siteTitle = data.site.siteMetadata.title
  const posts = data.allMarkdownRemark.edges
  const { currentPage, numPages } = pageContext

  const isFirst = currentPage === 1
  const isLast = currentPage === numPages
  const prevPage = currentPage - 1 === 1 ? "/" : `/page/${currentPage - 1}`
  const nextPage = `/page/${currentPage + 1}`

  const [term, setTerm] = useState("")
  const query = term.trim().toLowerCase()

  const topics = useMemo(
    () => mergeTags(data.tagGroup.group).slice(0, 14),
    [data.tagGroup.group]
  )

  // Searching spans the whole archive, not just the page currently in view.
  const MAX_RESULTS = 40
  const matches = useMemo(() => {
    if (!query) return null
    return data.allPosts.nodes.filter(node => {
      const f = node.frontmatter
      return (
        (f.title || "").toLowerCase().includes(query) ||
        (f.category || "").toLowerCase().includes(query)
      )
    })
  }, [query, data.allPosts.nodes])

  const results = matches ? matches.slice(0, MAX_RESULTS) : null

  const listed = results
    ? results.map(node => ({ node, dek: null }))
    : posts.map(({ node }) => ({
        node,
        dek: node.frontmatter.description || node.excerpt,
      }))

  return (
    <Layout location={location} title={siteTitle} wide>
      <section className="hb-hero">
        <p className="hb-kicker">
          {data.allPosts.totalCount} tutorials · free to read
        </p>
        <h1 className="hb-title">
          A working handbook for data and software engineering.
        </h1>
        <p className="hb-lede">
          Hands-on tutorials by Alex Merced on Apache Iceberg, the data
          lakehouse, pipelines, agentic AI, and the languages and tools that
          hold it all together.
        </p>

        <div className="hb-search" role="search">
          <input
            type="search"
            value={term}
            onChange={e => setTerm(e.target.value)}
            placeholder="Search all tutorials by title or topic"
            aria-label="Search tutorials"
          />
          {term && (
            <button
              type="button"
              className="hb-btn hb-btnGhost"
              onClick={() => setTerm("")}
            >
              Clear
            </button>
          )}
        </div>
      </section>

      {!query && (
        <>
          <div className="hb-sectionHead">
            <h2>Browse by topic</h2>
            <span className="hb-sectionNote">
              <Link to="/tags/">All topics</Link>
            </span>
          </div>
          <ul className="hb-topics">
            {topics.map(topic => (
              <li key={topic.slug}>
                <Link to={`/tags/${topic.slug}/`} className="hb-topic">
                  <span>{topic.label}</span>
                  <span className="hb-topicCount">{topic.total}</span>
                </Link>
              </li>
            ))}
          </ul>
        </>
      )}

      <div className="hb-sectionHead">
        <h2>{query ? "Search results" : "Latest tutorials"}</h2>
        <span className="hb-sectionNote">
          {query
            ? matches.length > MAX_RESULTS
              ? `Showing ${MAX_RESULTS} of ${matches.length} matches`
              : `${matches.length} match${matches.length === 1 ? "" : "es"}`
            : `Page ${currentPage} of ${numPages}`}
        </span>
      </div>

      {listed.length === 0 ? (
        <p className="hb-empty">
          Nothing matches “{term}”. Try a broader term.
        </p>
      ) : (
        <ol className="hb-list">
          {listed.map(({ node, dek }, i) => (
            <li key={node.fields.slug}>
              <Link to={node.fields.slug} className="hb-entry">
                <span className="hb-entryNum">
                  {String(i + 1).padStart(2, "0")}
                </span>
                <span className="hb-entryBody">
                  <span className="hb-entryTitle">
                    {node.frontmatter.title || node.fields.slug}
                  </span>
                  {dek && (
                    <span
                      className="hb-entryDek"
                      dangerouslySetInnerHTML={{ __html: dek }}
                    />
                  )}
                </span>
                <span className="hb-entryMeta">
                  {node.frontmatter.category && (
                    <span className="hb-entryCat">
                      {node.frontmatter.category}
                    </span>
                  )}
                  {node.frontmatter.date}
                </span>
              </Link>
            </li>
          ))}
        </ol>
      )}

      {!query && (
        <nav className="hb-pager">
          {!isFirst ? (
            <Link to={prevPage} rel="prev">
              ← Newer
            </Link>
          ) : (
            <span className="hb-pagerSpacer" />
          )}
          {!isLast && (
            <Link to={nextPage} rel="next">
              Older →
            </Link>
          )}
        </nav>
      )}
    </Layout>
  )
}

export default BlogIndex

export const Head = ({ pageContext, location }) => {
  const { currentPage } = pageContext
  const pageTitle =
    currentPage && currentPage > 1
      ? `Tutorials - Page ${currentPage}`
      : "Alex Merced Tutorials"
  return <Seo title={pageTitle} pathname={location.pathname} />
}

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
            date(formatString: "MMM DD, YYYY")
            title
            description
            category
          }
        }
      }
    }
    tagGroup: allMarkdownRemark {
      group(field: { frontmatter: { tags: SELECT } }) {
        fieldValue
        totalCount
      }
    }
    allPosts: allMarkdownRemark(sort: { frontmatter: { date: DESC } }) {
      totalCount
      nodes {
        fields {
          slug
        }
        frontmatter {
          title
          category
          date(formatString: "MMM DD, YYYY")
        }
      }
    }
  }
`
