import React from "react"
import { Link } from "gatsby"
import Layout from "../components/layout"
import Seo from "../components/seo"

const tracks = [
  {
    title: "Start with SQL and Python",
    prerequisites: "A terminal, Python 3, and a local SQL environment.",
    steps: [
      ["Learn the query basics", "/tags/sql/"],
      ["Practice data transformations", "/tags/python/"],
      ["Build a small pipeline", "/tags/data-engineering/"],
    ],
    outcome: "You can ingest a small dataset, query it, and explain the transformation."
  },
  {
    title: "Build an open lakehouse",
    prerequisites: "Comfort with SQL, containers, and object storage concepts.",
    steps: [
      ["Understand Apache Iceberg", "/tags/apache-iceberg/"],
      ["Explore catalogs and governance", "/tags/apache-polaris/"],
      ["Work through lakehouse patterns", "/tags/data-lakehouse/"],
    ],
    outcome: "You can sketch a storage, table, catalog, and engine stack and identify its tradeoffs."
  },
  {
    title: "Develop with AI agents",
    prerequisites: "Basic programming, Git, and an understanding of tool permissions.",
    steps: [
      ["Review agentic AI concepts", "/tags/agentic-ai/"],
      ["Explore developer workflows", "/tags/ai-coding-tools/"],
      ["Add evaluation and approval checks", "/tags/ai-agents/"],
    ],
    outcome: "You can describe an agent workflow with bounded tools, approvals, and verifiable results."
  }
]

export default function Tracks({ location }) {
  return <Layout location={location} title="Learning tracks" wide>
    <main style={{maxWidth:960,margin:"auto",padding:"3rem 1.5rem"}}>
      <h1>Choose a tutorial track</h1>
      <p>Each track points into the existing archive. Articles were written at different times and may use older library versions. Check the article date and the current project documentation before installing dependencies. Track links reviewed September 29, 2026; individual commands have not been retested.</p>
      {tracks.map(track=><section key={track.title} style={{padding:"1.5rem 0",borderBottom:"1px solid #888"}}>
        <h2>{track.title}</h2>
        <p><strong>Before you begin:</strong> {track.prerequisites}</p>
        <ol>{track.steps.map(([label,url])=><li key={label}><Link to={url}>{label}</Link></li>)}</ol>
        <p><strong>Checkpoint:</strong> {track.outcome}</p>
      </section>)}
      <p><Link to="/">Search the full archive →</Link></p>
    </main>
  </Layout>
}

export const Head = () => <Seo title="Learning tracks for data and software engineering" description="Three ordered tracks with prerequisites and checkpoints for SQL and Python, open lakehouses, and AI agents." />
