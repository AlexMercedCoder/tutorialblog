import React, { useContext } from "react"
import Giscus from "@giscus/react"
import ThemeContext from "../context/ThemeContext"

const Comments = () => {
    const { value: isDark } = useContext(ThemeContext)
    
    return (
        <div style={{ marginTop: '2rem' }}>
            <Giscus
                id="comments"
                repo="AlexMercedCoder/tutorialblog"
                repoId="MDEwOlJlcG9zaXRvcnkyODgyNTkxNDU="
                category="General"
                categoryId="DIC_kwDOES58Sc4C0VKF"
                mapping="pathname"
                strict="0"
                reactionsEnabled="1"
                emitMetadata="0"
                inputPosition="bottom"
                theme={isDark ? "dark" : "light"}
                lang="en"
                loading="lazy"
            />
        </div>
    )
}

export default Comments
