/**
 * SEO component that queries for data with
 *  Gatsby's useStaticQuery React hook
 *
 * See: https://www.gatsbyjs.org/docs/use-static-query/
 */

import React from "react"
import PropTypes from "prop-types"
import { useStaticQuery, graphql } from "gatsby"
import network from "../../network/network.json"

const Seo = ({ description, lang, meta, title, pathname = "", image, article = false, datePublished, dateModified, canonical: canonicalOverride }) => {
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

  // Netlify serves lowercase paths and 301s mixed case, so the self-canonical
  // uses the lowercase path. A syndicated copy's frontmatter `canonical`
  // (an absolute https URL to the master copy) wins.
  const selfCanonical = pathname ? `${cleanSiteUrl}${encodeURI(decodeURI(cleanPathname).toLowerCase())}` : null
  const canonical = /^https:\/\/\S+$/.test(canonicalOverride || "") ? canonicalOverride : selfCanonical

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
                  "item": selfCanonical || siteUrl
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
          author: { "@id": "https://alexmerced.com/#alexmerced" },
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
  const rawSlug = pathname
    ? pathname.replace(/^\/|\/$/g, '').replace(/\//g, '-').replace(/\.html$/, '')
    : '';
  const ogSlug = rawSlug || 'default';
  const ogImageUrl = image
    ? `${siteUrl}${image}`
    : `${cleanSiteUrl}/og/${ogSlug}.png`

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
      <meta name="twitter:site" content={network.twitterSite} />
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
  canonical: PropTypes.string,
}

export default Seo
