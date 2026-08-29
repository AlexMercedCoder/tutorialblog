import React from "react"
import { graphql } from "gatsby"
import Layout from "../components/layout"
import Seo from "../components/seo"
import bookData from "../data/books.json"

const BooksPage = ({
  data: {
    site: {
      siteMetadata: { title },
    },
  },
  location,
}) => {
  const { intro, books, count, totalInCatalog, catalog } = bookData

  return (
    <Layout location={location} title={title}>
      <Seo
        title="Books by Alex Merced"
        description="Books on AI-assisted development, building agents, shipping AI systems, and data engineering, written by Alex Merced."
      />
      <div className="hb-books">
        <header className="hb-booksHeader">
          <p className="hb-booksEyebrow">Books by Alex Merced</p>
          <h1>Read further</h1>
          <p className="hb-booksIntro">{intro}</p>
          <p className="hb-booksMeta">
            {count} of {totalInCatalog} titles.{" "}
            <a href={catalog} target="_blank" rel="noopener noreferrer">
              See the complete catalog
            </a>
          </p>
        </header>

        <ul className="hb-bookList">
          {books.map(book => (
            <li className="hb-bookItem" key={book.slug}>
              <a
                className="hb-bookCover"
                href={book.canonicalPage}
                target="_blank"
                rel="noopener noreferrer"
                tabIndex={-1}
                aria-hidden="true"
              >
                <img src={book.cover} alt="" loading="lazy" decoding="async" />
              </a>
              <div>
                <h2 className="hb-bookTitle">
                  <a href={book.canonicalPage} target="_blank" rel="noopener noreferrer">
                    {book.title}
                  </a>
                </h2>
                {book.publisher ? (
                  <p className="hb-bookPublisher">{book.publisher}</p>
                ) : null}
                <p className="hb-bookDesc">{book.description}</p>
                <p className="hb-bookLinks">
                  <a href={book.canonicalPage} target="_blank" rel="noopener noreferrer">
                    Details
                  </a>
                  <a href={book.amazon} target="_blank" rel="noopener noreferrer">
                    Buy on Amazon
                  </a>
                </p>
              </div>
            </li>
          ))}
        </ul>
      </div>
    </Layout>
  )
}

export default BooksPage

export const pageQuery = graphql`
  query {
    site {
      siteMetadata {
        title
      }
    }
  }
`
