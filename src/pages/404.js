import React from "react"
import { graphql } from "gatsby"

import Layout from "../components/layout"
import Seo from "../components/seo"

const NotFoundPage = ({ data, location }) => {
  const siteTitle = data.site.siteMetadata.title

  return (
    <Layout location={location} title={siteTitle}>
      <h1>Not Found</h1>
      <p>
        You just hit a route that doesn&#39;t exist... the sadness. The URL May
        of move so head to the main page.
      </p>
      <p>
        Also make sure to subscribe to{" "}
        <a href="https://www.youtube.com/AlexMercedFullStackDeveloper">
          my youtube channel!
        </a>
      </p>
    </Layout>
  )
}

export const Head = ({ location }) => <Seo title="404: Not Found" pathname={location.pathname} />

export default NotFoundPage

export const pageQuery = graphql`
  query {
    site {
      siteMetadata {
        title
      }
    }
  }
`
