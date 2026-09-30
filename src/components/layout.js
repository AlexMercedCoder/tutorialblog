import React from "react"
import { Link } from "gatsby"
import ScrollToTop from "./scrollToTop"
import ThemeContext from "../context/ThemeContext"
import network from "../../network/network.json"

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

        {network.cta && (
          <section className="hb-cta" aria-label={network.cta.heading}>
            <div className="hb-wrap hb-ctaInner">
              <h2 className="hb-ctaTitle">{network.cta.heading}</h2>
              <ul className="hb-ctaLinks">
                {network.cta.links.map((link, i) => (
                  <li key={link.event}>
                    <a
                      href={link.url}
                      data-network-event={link.event}
                      className={i === 0 ? "hb-ctaPrimary" : "hb-ctaSecondary"}
                    >
                      {link.label}
                    </a>
                  </li>
                ))}
              </ul>
            </div>
          </section>
        )}

        <footer className="hb-footer">
          <div className="hb-wrap">
            <div className="hb-footerRow">
              <span>© {new Date().getFullYear()} Alex Merced</span>
              <span className="hb-footerLinks">
                <Link to="/books/">Books</Link>
                <a href="/rss.xml">RSS</a>
              </span>
            </div>
            <nav className="hb-network" aria-label="The Alex Merced Network">
              {network.footer.groups.map(group => (
                <div key={group.title}>
                  <h2 className="hb-networkTitle">{group.title}</h2>
                  <ul className="hb-footerLinks">
                    {group.links.map(link => (
                      <li key={link.url}>
                        <a href={link.url}>{link.title}</a>
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
              <p className="hb-allSites">
                <a href={network.footer.allSitesUrl}>{network.footer.allSitesLabel}</a>
              </p>
            </nav>
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
