import React from "react"

const Share = ({ title, url, twitterHandle }) => {
    const iconSize = 40;
    const twitterUrl = `https://twitter.com/intent/tweet?text=${encodeURIComponent(title)}&url=${encodeURIComponent(url)}&via=${twitterHandle || ''}`;
    const linkedinUrl = `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(url)}`;
    const redditUrl = `https://www.reddit.com/submit?url=${encodeURIComponent(url)}&title=${encodeURIComponent(title)}`;

    return (
        <div className="post-social" style={{ display: 'flex', gap: '10px', marginTop: '1rem', marginBottom: '1rem' }}>
            <a href={twitterUrl} target="_blank" rel="noopener noreferrer" aria-label="Share on Twitter" style={{ color: '#1DA1F2', textDecoration: 'none', fontSize: '24px' }}>
                🐦
            </a>
            <a href={linkedinUrl} target="_blank" rel="noopener noreferrer" aria-label="Share on LinkedIn" style={{ color: '#0077b5', textDecoration: 'none', fontSize: '24px' }}>
                👔
            </a>
            <a href={redditUrl} target="_blank" rel="noopener noreferrer" aria-label="Share on Reddit" style={{ color: '#FF5700', textDecoration: 'none', fontSize: '24px' }}>
                👽
            </a>
        </div>
    )
}

export default Share
