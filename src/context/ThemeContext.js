import React from "react"

const ThemeContext = React.createContext({
  value: false,
  toggle: () => {},
})

export default ThemeContext
