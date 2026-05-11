import { describe, expect, it } from "vitest"
import { render, screen } from "@testing-library/react"
import { CommitGraph } from "./commit-graph"

const linearCommits = [
  {
    hash: "aaa1111",
    message: "Latest commit",
    author: { name: "Hleb T" },
    date: new Date("2025-05-10T12:00:00Z"),
    parents: ["bbb2222"],
  },
  {
    hash: "bbb2222",
    message: "Older commit",
    author: { name: "Hleb T" },
    date: new Date("2025-05-09T12:00:00Z"),
    parents: ["ccc3333"],
  },
  {
    hash: "ccc3333",
    message: "Initial",
    author: { name: "Hleb T" },
    date: new Date("2025-05-08T12:00:00Z"),
    parents: [],
  },
]

describe("CommitGraph", () => {
  it("renders empty state when no commits", () => {
    render(<CommitGraph commits={[]} />)
    expect(screen.getByText("No commits.")).toBeInTheDocument()
  })

  it("renders one entry per commit", () => {
    render(<CommitGraph commits={linearCommits} />)
    expect(screen.getAllByRole("button")).toHaveLength(3)
  })

  it("truncates hash to default length 7", () => {
    render(<CommitGraph commits={linearCommits} />)
    expect(screen.getByText("aaa1111")).toBeInTheDocument()
  })

  it("uses custom truncateHash length", () => {
    render(<CommitGraph commits={linearCommits} truncateHash={4} />)
    expect(screen.getByText("aaa1")).toBeInTheDocument()
  })

  it("renders ref badges", () => {
    const data = [
      {
        ...linearCommits[0]!,
        refs: ["main", "origin/main"],
      },
      ...linearCommits.slice(1),
    ]
    render(<CommitGraph commits={data} />)
    expect(screen.getByText("main")).toBeInTheDocument()
    expect(screen.getByText("origin/main")).toBeInTheDocument()
  })
})
