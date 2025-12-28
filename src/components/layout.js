import React from "react"
import { Link } from "gatsby"
import ScrollToTop from "./scrollToTop"

const Layout = ({ location, title, children }) => {
  const rootPath = `${__PATH_PREFIX__}/`
  const darkMode = useDarkMode(false)
  
  let header
  
  // ... (header logic remains same)

  return (
    <div
      style={{
        marginLeft: `auto`,
        marginRight: `auto`,
        maxWidth: rhythm(24),
        padding: `${rhythm(1.5)} ${rhythm(3 / 4)}`,
      }}
    >
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <div>{header}</div>
        <button 
            type="button" 
            onClick={darkMode.toggle}
            style={{ 
                cursor: 'pointer',
                background: 'transparent',
                border: 'none',
                fontSize: '1.5rem'
            }}
        >
            {darkMode.value ? '☀️' : '🌙'}
        </button>
      </header>
      <main>{children}</main>
      <footer>
        © {new Date().getFullYear()}, Built with
        {` `}
        <a href="https://www.gatsbyjs.com">Gatsby</a>
      </footer>
      <ScrollToTop />
    </div>
  )
}

export default Layout
