import React from "react"
import { Link } from "gatsby"
import {
  FaYoutube,
  FaFacebookSquare,
  FaTwitter,
  FaGithubSquare,
  FaInstagramSquare,
} from "react-icons/fa"
import "../styles.css"

import { rhythm, scale } from "../utils/typography"

const Layout = ({ location, title, children }) => {
  const rootPath = `${__PATH_PREFIX__}/`
  let header

  const shadow = {
    boxShadow: "0",
  }

  if (location.pathname === rootPath) {
    header = (
      <h1
        style={{
          ...scale(1.5),
          marginBottom: rhythm(1.5),
          marginTop: 0,
          color: "darkred",
        }}
      >
        <Link
          style={{
            boxShadow: `none`,
            color: `inherit`,
          }}
          to={`/`}
        >
          {title}
        </Link>
      </h1>
    )
  } else {
    header = (
      <h3
        style={{
          fontFamily: `Montserrat, sans-serif`,
          marginTop: 0,
          color: "darkred",
        }}
      >
        <Link
          style={{
            boxShadow: `none`,
            color: `inherit`,
          }}
          to={`/`}
        >
          {title}
        </Link>
      </h3>
    )
  }
  return (
    <div
      style={{
        marginLeft: `auto`,
        marginRight: `auto`,
        maxWidth: rhythm(24),
        padding: `${rhythm(1.5)} ${rhythm(3 / 4)}`,
      }}
    >
      <header>{header}</header>
      <nav id="nav">
        <div>
          <a
            href="https://www.youtube.com/AlexMercedFullStackDeveloper"
            style={shadow}
          >
            <FaYoutube />
          </a>
        </div>
        <div>
          <a href="https://www.facebook.com/AlexMercedCoder">
            <FaFacebookSquare />
          </a>
        </div>
        <div>
          <a href="https://www.twitter.com/AlexMercedCoder">
            <FaTwitter />
          </a>
        </div>
        <div>
          <a href="https://www.instagram.com/AlexMercedCoder">
            <FaInstagramSquare />
          </a>
        </div>
        <div>
          <a href="https://www.github.com/AlexMercedCoder">
            <FaGithubSquare />
          </a>
        </div>
      </nav>
      <main>{children}</main>
      <footer>© alexmercedcoder.dev 2020</footer>
    </div>
  )
}

export default Layout
