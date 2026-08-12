import Typography from "typography"
import Wordpress2016 from "typography-theme-wordpress-2016"

// The theme hardcodes its own body/link/heading colours, which fought the
// token system and would have pinned text to near-black in dark mode. Point
// every colour it emits at a variable instead.
Wordpress2016.overrideThemeStyles = () => {
  return {
    "a.gatsby-resp-image-link": {
      boxShadow: `none`,
    },

    a: {
      boxShadow: "none",
      color: "var(--accent)",
    },

    body: {
      color: "var(--ink)",
      background: "var(--paper)",
    },

    "h1, h2, h3, h4, h5, h6": {
      color: "var(--ink)",
    },

    blockquote: {
      color: "var(--muted)",
      borderLeftColor: "var(--accent)",
    },

    "blockquote cite": {
      color: "var(--ink)",
    },

    hr: {
      background: "var(--rule)",
    },

    "mark, ins": {
      background: "var(--accent-wash)",
      color: "var(--ink)",
    },
  }
}

delete Wordpress2016.googleFonts

const typography = new Typography(Wordpress2016)

// Hot reload typography in development.
if (process.env.NODE_ENV !== `production`) {
  typography.injectStyles()
}

export default typography
export const rhythm = typography.rhythm
export const scale = typography.scale
