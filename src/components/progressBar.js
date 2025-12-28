import React, { useState, useEffect } from 'react'
import { rhythm } from "../utils/typography"

const ProgressBar = () => {
    const [progress, setProgress] = useState(0);

    useEffect(() => {
        const scrollHeight = () => {
            const el = document.documentElement;
            const ScrollTop = el.scrollTop || document.body.scrollTop;
            const ScrollHeight = el.scrollHeight || document.body.scrollHeight;
            const clientHeight = el.clientHeight;
            const height = ScrollHeight - clientHeight;
            const scrolled = (ScrollTop / height) * 100;
            
            setProgress(scrolled);
        }

        window.addEventListener('scroll', scrollHeight);
        return () => window.removeEventListener('scroll', scrollHeight);
    }, []);

    return (
        <div 
            style={{
                position: 'fixed',
                top: 0,
                left: 0,
                width: `${progress}%`,
                height: rhythm(0.2),
                backgroundColor: 'var(--link)',
                zIndex: 9999,
                transition: 'width 0.2s ease-out'
            }}
        />
    )
}

export default ProgressBar
