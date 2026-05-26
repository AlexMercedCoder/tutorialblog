/**
 * SEO component that queries for data with
 *  Gatsby's useStaticQuery React hook
 *
 * See: https://www.gatsbyjs.org/docs/use-static-query/
 */

import React from "react"
import PropTypes from "prop-types"
import { useStaticQuery, graphql } from "gatsby"

const Seo = ({ description, lang, meta, title, pathname = "", image, article = false, datePublished, dateModified }) => {
  const { site } = useStaticQuery(
    graphql`
      query {
        site {
          siteMetadata {
            title
            description
            siteUrl
            author {
              name
            }
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

  // Normalize siteUrl and pathname to avoid double slashes and ensure trailing slashes for canonical URLs
  const cleanSiteUrl = siteUrl.endsWith('/') ? siteUrl.slice(0, -1) : siteUrl
  let cleanPathname = pathname.startsWith('/') ? pathname : `/${pathname}`
  
  if (cleanPathname !== '/' && !cleanPathname.endsWith('/') && !cleanPathname.includes('.')) {
    cleanPathname = `${cleanPathname}/`
  }

  const canonical = pathname ? `${cleanSiteUrl}${cleanPathname}` : null

  // Schema.org/WebSite
  const webSiteSchema = {
    "@context": "https://schema.org",
    "@type": "WebSite",
    url: siteUrl,
    name: defaultTitle,
  }

  let schema = [webSiteSchema];

  // Schema.org/BreadcrumbList
  if (pathname) {
      const breadcrumbSchema = {
          "@context": "https://schema.org",
          "@type": "BreadcrumbList",
          "itemListElement": [
              {
                  "@type": "ListItem",
                  "position": 1,
                  "name": "Home",
                  "item": siteUrl
              },
              {
                  "@type": "ListItem",
                  "position": 2,
                  "name": title,
                  "item": canonical || siteUrl
              }
          ]
      };
      schema.push(breadcrumbSchema);
  }

  // Schema.org/Article
  if (article) {
       const articleSchema = {
          "@context": "https://schema.org",
          "@type": "Article",
          headline: title,
          description: metaDescription,
          image: image ? `${siteUrl}${image}` : undefined,
          author: {
              "@type": "Person",
              name: site.siteMetadata.author?.name || "Alex Merced",
              url: "https://alexmercedcoder.dev/"
          },
          publisher: {
              "@type": "Organization",
              name: defaultTitle,
              logo: {
                  "@type": "ImageObject",
                  url: `${siteUrl}icons/icon-512x512.png` // Default from manifest
              }
          },
          datePublished: datePublished || null,
          dateModified: dateModified || datePublished || null,
          mainEntityOfPage: {
              "@type": "WebPage",
              "@id": canonical || siteUrl
          }
       }
       schema.push(articleSchema)
  }


  // Dynamic OG image fallback — generate branded card when no bannerImage is set
  const ogImageUrl = image
    ? `${siteUrl}${image}`
    : `${cleanSiteUrl}/og?title=${encodeURIComponent(title)}`

  return (
    <>
      <html lang={lang} />
      <title>{title ? `${title} | ${defaultTitle}` : defaultTitle}</title>
      {canonical && <link rel="canonical" href={canonical} />}
      <link rel="alternate" type="text/plain" href={`${cleanSiteUrl}/llms.txt`} title="LLMs.txt" />
      <meta name="description" content={metaDescription} />
      <meta property="og:site_name" content={defaultTitle} />
      <meta property="og:title" content={title} />
      <meta property="og:description" content={metaDescription} />
      <meta property="og:type" content={article ? "article" : "website"} />
      <meta property="og:image" content={ogImageUrl} />
      <meta name="twitter:card" content="summary_large_image" />
      <meta name="twitter:creator" content={site.siteMetadata?.social?.twitter || ``} />
      <meta name="twitter:title" content={title} />
      <meta name="twitter:description" content={metaDescription} />
      <meta name="twitter:image" content={ogImageUrl} />
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
  article: PropTypes.bool,
  datePublished: PropTypes.string,
  dateModified: PropTypes.string,
}

export default Seo
