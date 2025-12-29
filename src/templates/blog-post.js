import React, { useEffect, useState } from "react"
import { Link, graphql } from "gatsby"

import Bio from "../components/bio"
import Layout from "../components/layout"
import Seo from "../components/seo"
import { rhythm, scale } from "../utils/typography"

import Share from "../components/share"
import Comments from "../components/comments"
import ProgressBar from "../components/progressBar"


const kebabCase = (str) => str && str.match(/[A-Z]{2,}(?=[A-Z][a-z]+[0-9]*|\b)|[A-Z]?[a-z]+[0-9]*|[A-Z]|[0-9]+/g)
  .map(x => x.toLowerCase())
  .join('-');

const BlogPostTemplate = ({ data, pageContext, location }) => {
  const post = data.markdownRemark
  const siteTitle = data.site.siteMetadata.title
  const twitterHandle = data.site.siteMetadata.social.twitter
  const { previous, next } = pageContext
  const url = `${data.site.siteMetadata.siteUrl}${location.pathname}`;

  const [hasCelebrated, setHasCelebrated] = useState(false);

  useEffect(() => {
    // Confetti Logic
    const handleScroll = async () => {
        if (hasCelebrated) return;

        const scrolledToBottom = window.innerHeight + window.scrollY >= document.body.offsetHeight - 100;
        if (scrolledToBottom) {
             setHasCelebrated(true);
        }
    };

    window.addEventListener('scroll', handleScroll);
    
    // Add Copy Button to code blocks
    const codeBlocks = document.querySelectorAll('pre');
    codeBlocks.forEach(block => {
        if (block.querySelector('button.copy-btn')) return; // already added

        const button = document.createElement('button');
        button.innerText = 'Copy';
        button.className = 'copy-btn';
        button.style.position = 'absolute';
        button.style.top = '5px';
        button.style.right = '5px';
        button.style.fontSize = '12px';
        button.style.background = '#444';
        button.style.color = '#fff';
        button.style.border = 'none';
        button.style.borderRadius = '3px';
        button.style.cursor = 'pointer';
        button.style.zIndex = '10';

        // Ensure relative positioning on block for absolute button
        if (getComputedStyle(block).position === 'static') {
            block.style.position = 'relative'; 
        }

        button.addEventListener('click', () => {
             const code = block.querySelector('code')?.innerText || block.innerText;
             navigator.clipboard.writeText(code).then(() => {
                 button.innerText = 'Copied!';
                 setTimeout(() => { button.innerText = 'Copy' }, 2000);
             });
        });

        block.appendChild(button);
    });

    return () => window.removeEventListener('scroll', handleScroll);
  }, [hasCelebrated]);

  return (
    <Layout location={location} title={siteTitle}>
      <ProgressBar />
      <article>
        <header>
          <h1
            style={{
              marginTop: rhythm(1),
              marginBottom: 0,
            }}
          >
            {post.frontmatter.title}
          </h1>
          <p
            style={{
              ...scale(-1 / 5),
              display: `block`,
              marginBottom: rhythm(1),
            }}
          >
            {post.frontmatter.date} • {post.timeToRead} min read
          </p>
        </header>
        {post.tableOfContents && (
          <details style={{ marginBottom: rhythm(1), background: "#f9f9f9", padding: "10px", borderRadius: "5px" }}>
              <summary style={{ cursor: "pointer", fontWeight: "bold" }}>Table of Contents</summary>
              <div dangerouslySetInnerHTML={{ __html: post.tableOfContents }} />
          </details>
        )}
        <section dangerouslySetInnerHTML={{ __html: post.html }} />
        {post.frontmatter.tags && (
            <div style={{ marginTop: rhythm(1), marginBottom: rhythm(1) }}>
                <ul style={{ listStyle: 'none', display: 'flex', flexWrap: 'wrap', padding: 0 }}>
                    {post.frontmatter.tags.map(tag => {
                        return (
                            <li key={tag} style={{ marginRight: '10px' }}>
                                <Link to={`/tags/${kebabCase(tag)}/`}>#{tag}</Link>
                            </li>
                        )
                    })}
                </ul>
            </div>
        )}
        <Share title={post.frontmatter.title} url={url} twitterHandle={twitterHandle} />
        
        {pageContext.relatedPosts && pageContext.relatedPosts.length > 0 && (
            <div style={{ marginTop: rhythm(1), marginBottom: rhythm(1) }}>
                <h3>Related Posts</h3>
                <ul style={{ listStyle: 'none', marginLeft: 0 }}>
                    {pageContext.relatedPosts.map(p => (
                        <li key={p.slug} style={{ marginBottom: rhythm(0.25) }}>
                            <Link to={p.slug}>{p.title}</Link> <small>({p.date})</small>
                        </li>
                    ))}
                </ul>
            </div>
        )}

        <Comments />

        <hr
          style={{
            marginBottom: rhythm(1),
          }}
        />
        <footer>
          <Bio />
        </footer>
      </article>

      <nav>
        <ul
          style={{
            display: `flex`,
            flexWrap: `wrap`,
            justifyContent: `space-between`,
            listStyle: `none`,
            padding: 0,
          }}
        >
          <li>
            {previous && (
              <Link to={previous.fields.slug} rel="prev">
                ← {previous.frontmatter.title}
              </Link>
            )}
          </li>
          <li>
            {next && (
              <Link to={next.fields.slug} rel="next">
                {next.frontmatter.title} →
              </Link>
            )}
          </li>
        </ul>
      </nav>
    </Layout>
  )
}

export const Head = ({ data, location }) => {
  const post = data.markdownRemark
  return (
    <Seo
      title={post.frontmatter.title}
      description={post.frontmatter.description || post.excerpt}
      pathname={location.pathname}
      image={post.frontmatter.bannerImage}
      article={true}
    />
  )
}

export default BlogPostTemplate

export const pageQuery = graphql`
  query BlogPostBySlug($slug: String!) {
    site {
      siteMetadata {
        title
        siteUrl
        social {
          twitter
        }
      }
    }
    markdownRemark(fields: { slug: { eq: $slug } }) {
      id
      excerpt(pruneLength: 160)
      html
      tableOfContents(absolute: false, maxDepth: 3)
      timeToRead
      fields {
        slug
      }
      frontmatter {
        title
        date(formatString: "MMMM DD, YYYY")
        description
        bannerImage
        tags
      }
    }
  }
`
