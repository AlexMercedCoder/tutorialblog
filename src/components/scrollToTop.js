import React, { useState, useEffect } from 'react'
import { rhythm } from "../utils/typography"

const ScrollToTop = () => {
    const [isVisible, setIsVisible] = useState(false);

    const toggleVisibility = () => {
        if (window.scrollY > 300) {
            setIsVisible(true);
        } else {
            setIsVisible(false);
        }
    };

    const scrollToTop = () => {
        window.scrollTo({
            top: 0,
            behavior: "smooth"
        });
    };

    useEffect(() => {
        window.addEventListener("scroll", toggleVisibility);
        return () => window.removeEventListener("scroll", toggleVisibility);
    }, []);

    return (
        <>
            {isVisible && (
                <button 
                    onClick={scrollToTop}
                    title="Back to Top"
                    style={{
                        position: 'fixed',
                        bottom: '20px',
                        right: '20px',
                        width: '50px',
                        height: '50px',
                        borderRadius: '50%',
                        backgroundColor: 'var(--link)',
                        color: 'var(--bg)',
                        border: 'none',
                        cursor: 'pointer',
                        fontSize: '24px',
                        boxShadow: '0 2px 10px rgba(0,0,0,0.3)',
                        zIndex: 1000,
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center'
                    }}
                >
                    ↑
                </button>
            )}
        </>
    )
}

export default ScrollToTop
