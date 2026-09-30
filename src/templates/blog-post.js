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
        button.setAttribute('type', 'button');
        button.setAttribute('aria-label', 'Copy code to clipboard');
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
      <article className="hb-article">
        <header className="hb-articleHead">
          {post.frontmatter.category && (
            <Link
              to={`/tags/${kebabCase(post.frontmatter.category)}/`}
              className="hb-chip"
            >
              {post.frontmatter.category}
            </Link>
          )}
          <h1 className="hb-articleTitle">{post.frontmatter.title}</h1>
          <div className="hb-articleMeta">
            <span>{post.frontmatter.date}</span>
            <span>{post.timeToRead} min read</span>
            <span>Alex Merced</span>
          </div>
        </header>
        {post.tableOfContents && (
          <details className="hb-toc">
            <summary>Table of contents</summary>
            <div dangerouslySetInnerHTML={{ __html: post.tableOfContents }} />
          </details>
        )}
        <section
          className="hb-prose"
          dangerouslySetInnerHTML={{ __html: post.html.replace(/<(\/?)h1(\s|>)/g, "<$1h2$2") }}
        />
        {post.frontmatter.tags && (
            <div className="hb-tagRow">
                <ul>
                    {post.frontmatter.tags.map(tag => (
                        <li key={tag}>
                            <Link to={`/tags/${kebabCase(tag)}/`}>#{tag}</Link>
                        </li>
                    ))}
                </ul>
            </div>
        )}
        <Share title={post.frontmatter.title} url={url} twitterHandle={twitterHandle} />
        
        {pageContext.relatedPosts && pageContext.relatedPosts.length > 0 && (
            <div className="hb-related">
                <h3>Related tutorials</h3>
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
        <ul className="hb-postNav">
          <li>
            {previous && (
              <Link to={previous.fields.slug} rel="prev">
                <small>← Previous</small>
                <span>{previous.frontmatter.title}</span>
              </Link>
            )}
          </li>
          <li>
            {next && (
              <Link to={next.fields.slug} rel="next">
                <small>Next →</small>
                <span>{next.frontmatter.title}</span>
              </Link>
            )}
          </li>
        </ul>
      </nav>
    </Layout>
  )
}

// The generated excerpt starts with the cross-post note on syndicated copies;
// drop that sentence so the fallback description is the first real paragraph.
const cleanExcerpt = excerpt => {
  const text = String(excerpt || "")
    .replace(
      /^Cross-posted\.\s+This article['’]s canonical home is (?:Alex Merced['’]s Lakehouse Blog|Data Lakehouse Hub|AlexMerced\.blog|Coding Tutorials Blog|[^.]+)\.\s*/,
      ""
    )
    .trim()
  return text.length > 160 ? `${text.slice(0, 157).replace(/\s+\S*$/, "")}...` : text
}

export const Head = ({ data, location }) => {
  const post = data.markdownRemark
  return (
    <Seo
      title={post.frontmatter.title}
      description={post.frontmatter.description || cleanExcerpt(post.excerpt)}
      pathname={location.pathname}
      canonical={post.frontmatter.canonical}
      article={true}
      datePublished={post.frontmatter.isoDate}
      dateModified={post.frontmatter.isoDate}
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
      excerpt(pruneLength: 320)
      html
      tableOfContents(absolute: false, maxDepth: 3)
      timeToRead
      fields {
        slug
      }
      frontmatter {
        title
        date(formatString: "MMMM DD, YYYY")
        isoDate: date(formatString: "YYYY-MM-DDTHH:mm:ssZ")
        description
        category
        tags
        canonical
      }
    }
  }
`
