import React from "react"
import { Link } from "gatsby"
import ScrollToTop from "./scrollToTop"
import { rhythm, scale } from "../utils/typography"
import ThemeContext from "../context/ThemeContext"

const useDarkMode = () => {
    const [isDark, setIsDark] = React.useState(false);
    
    React.useEffect(() => {
        const stored = localStorage.getItem('darkMode') === 'true';
        setIsDark(stored);
        if (stored) {
             document.body.classList.add('dark-mode');
        }
    }, []);

    const toggle = () => {
        const newState = !isDark;
        setIsDark(newState);
        localStorage.setItem('darkMode', newState);
        document.body.classList.toggle('dark-mode', newState);
    };

    return { value: isDark, toggle };
}

const Layout = ({ location, title, children }) => {
  const rootPath = `${__PATH_PREFIX__}/`
  const darkMode = useDarkMode()
  
  let header
  
  // ... (header logic remains same)

  return (
    <ThemeContext.Provider value={darkMode}>
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
    </ThemeContext.Provider>
  )
}

export default Layout
