// Prism first so the local overrides in global.css win on equal specificity.
// (The minifier collapses tricks like `.token.token.x`, so order is the only
// reliable lever here.)
import "prismjs/themes/prism.css"

import "./src/styles/global.css"
import "@fontsource-variable/inter"
import "@fontsource-variable/jetbrains-mono"
import "@fontsource/merriweather"
