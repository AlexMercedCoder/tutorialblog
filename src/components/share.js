import React from 'react'
import {
	TwitterShareButton,
	LinkedinShareButton,
	RedditShareButton,
    TwitterIcon,
    LinkedinIcon,
    RedditIcon
} from 'react-share'

const Share = ({ title, url, twitterHandle }) => {
    const iconSize = 40;

    return (
        <div className="post-social">
            <TwitterShareButton url={url} title={title} via={twitterHandle}>
                <TwitterIcon size={iconSize} round={true} />
            </TwitterShareButton>

            <LinkedinShareButton url={url} >
                <LinkedinIcon size={iconSize} round={true} />
            </LinkedinShareButton>

            <RedditShareButton url={url} title={title} >
                <RedditIcon size={iconSize} round={true} />
            </RedditShareButton>
            
            <style jsx>{`
                .post-social {
                    display: flex;
                    gap: 10px;
                    margin-top: 1rem;
                    margin-bottom: 1rem;
                }
            `}</style>
        </div>
    )
}

export default Share
