/**
 * SEO component that queries for data with
 *  Gatsby's useStaticQuery React hook
 *
 * See: https://www.gatsbyjs.org/docs/use-static-query/
 */

import React from "react"
import PropTypes from "prop-types"
import { useStaticQuery, graphql } from "gatsby"

const Seo = ({ description, lang, meta, title, pathname = "", image }) => {
  const { site } = useStaticQuery(
    graphql`
      query {
        site {
          siteMetadata {
            title
            description
            siteUrl
            social {
              twitter
            }
          }
        }
      }
    `
  )

  const metaDescription = description || site.siteMetadata.description
  const defaultTitle = site.siteMetadata?.title
  const siteUrl = site.siteMetadata?.siteUrl
  const canonical = pathname ? `${siteUrl}${pathname}` : null

  // Schema.org/WebSite
  const webSiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    url: siteUrl,
    name: defaultTitle,
  }

  // Schema.org/Article (if standard blog post content is present - inferred by title/desc)
  // Ideally, we'd pass a prop to confirm "isArticle", but present logic improves base state.
  // For exact "Article" schema, we can add it dynamically if the page is a blog post.
  let schema = webSiteSchema
  if (title && description) {
      // Basic Article Schema for blog posts
       const articleSchema = {
          "@context": "https://schema.org",
          "@type": "Article",
          headline: title,
          description: metaDescription,
          image: image ? `${siteUrl}${image}` : undefined,
          author: {
              "@type": "Person",
              name: site.siteMetadata.author?.name || "Alex Merced"
          },
          publisher: {
              "@type": "Organization",
              name: defaultTitle,
              logo: {
                  "@type": "ImageObject",
                  url: `${siteUrl}icons/icon-512x512.png` // Default from manifest
              }
          }
       }
       // If it's a specific page (implied by pathname), prefer article schema or mix
       if (pathname !== "/") {
           schema = [webSiteSchema, articleSchema]
       }
  }


  return (
    <>
      <html lang={lang} />
      <title>{title ? `${title} | ${defaultTitle}` : defaultTitle}</title>
      {canonical && <link rel="canonical" href={canonical} />}
      <meta name="description" content={metaDescription} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={metaDescription} />
      <meta property="og:type" content="website" />
      {image && <meta property="og:image" content={`${siteUrl}${image}`} />}
      <meta name="twitter:card" content="summary" />
      <meta name="twitter:creator" content={site.siteMetadata?.social?.twitter || ``} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={metaDescription} />
      {meta.map((m, i) => (
        <meta key={i} {...m} />
      ))}
      <script type="application/ld+json">{JSON.stringify(schema)}</script>
    </>
  )
}

Seo.defaultProps = {
  lang: `en`,
  meta: [],
  description: ``,
}

Seo.propTypes = {
  description: PropTypes.string,
  lang: PropTypes.string,
  meta: PropTypes.arrayOf(PropTypes.object),
  title: PropTypes.string.isRequired,
  pathname: PropTypes.string,
  image: PropTypes.string,
}

export default Seo
