import React from "react"
import { Link } from "gatsby"
import ScrollToTop from "./scrollToTop"
import ThemeContext from "../context/ThemeContext"

const useDarkMode = () => {
  const [isDark, setIsDark] = React.useState(false)

  React.useEffect(() => {
    const stored = localStorage.getItem("darkMode") === "true"
    setIsDark(stored)
    document.body.classList.toggle("dark-mode", stored)
    document.body.classList.toggle("light-mode", !stored)
  }, [])

  const toggle = () => {
    const newState = !isDark
    setIsDark(newState)
    localStorage.setItem("darkMode", newState)
    document.body.classList.toggle("dark-mode", newState)
    document.body.classList.toggle("light-mode", !newState)
  }

  return { value: isDark, toggle }
}

const NAV = [
  { label: "Tutorials", to: "/" },
  { label: "Topics", to: "/tags/" },
]

/**
 * `wide` opts a page into the full-width shell. Article pages stay narrow so
 * the measure suits long-form reading.
 */
const Layout = ({ location, title, children, wide = false }) => {
  const darkMode = useDarkMode()
  const wrapClass = wide ? "hb-wrap" : "hb-wrap hb-wrap--read"

  return (
    <ThemeContext.Provider value={darkMode}>
      <div className="hb-shell">
        <header className="hb-header">
          <div className="hb-wrap hb-headerInner">
            <Link to="/" className="hb-brand" aria-label={title}>
              <span>
                Alex Merced <em>Tutorials</em>
              </span>
              <span className="hb-brandTag">handbook</span>
            </Link>

            <nav className="hb-nav">
              {NAV.map(item => (
                <Link key={item.to} to={item.to}>
                  {item.label}
                </Link>
              ))}
              <a
                href="https://alexmerced.com"
                target="_blank"
                rel="noopener noreferrer"
              >
                About
              </a>
              <button
                type="button"
                className="hb-toggle"
                onClick={darkMode.toggle}
                aria-label={
                  darkMode.value ? "Switch to light theme" : "Switch to dark theme"
                }
              >
                {darkMode.value ? "☀" : "☾"}
              </button>
            </nav>
          </div>
        </header>

        <main className={wrapClass}>{children}</main>

        <footer className="hb-footer">
          <div className="hb-wrap">
            <div className="hb-footerRow">
              <span>© {new Date().getFullYear()} Alex Merced</span>
              <span className="hb-footerLinks">
                <a href="https://alexmerced.com">alexmerced.com</a>
                <a href="https://grokoverflow.com">GrokOverflow</a>
                <a href="https://ingestthis.com">IngestThis</a>
                <a href="https://openagenticplatform.com">OpenAgenticPlatform</a>
                <a href="https://www.alexmercedai.com">AlexMercedAI</a>
                <a href="https://books.alexmerced.com">Books</a>
                <a href="/rss.xml">RSS</a>
              </span>
            </div>
            <p className="hb-newsletter">
              Two free weekly newsletters: an AI newsletter on Thursdays and an
              Apache lakehouse newsletter on Fridays.{" "}
              <a href="https://amdatalakehouse.substack.com">Subscribe on Substack</a>
            </p>
            <p className="hb-disclaimer">
              The views, thoughts, and opinions expressed on this site belong
              solely to Alex Merced and do not represent the views of any
              organization or employer.
            </p>
          </div>
        </footer>

        <ScrollToTop />
      </div>
    </ThemeContext.Provider>
  )
}

export default Layout
