"use client"

import { CommitGraph } from "@workspace/ui/components/commit-graph"

const day = 24 * 60 * 60 * 1000
const now = Date.now()

const commits = [
  {
    hash: "merge0011",
    message: "Merge feature/gallery into main",
    author: { name: "Hleb Tkachenko" },
    date: new Date(now - day),
    parents: ["main00011", "feat00011"],
    refs: ["main"],
  },
  {
    hash: "main00011",
    message: "feat(ui): unify chart types",
    author: { name: "Hleb Tkachenko" },
    date: new Date(now - 2 * day),
    parents: ["root00011"],
  },
  {
    hash: "feat00011",
    message: "feat(gallery): add empty state",
    author: { name: "Contributor" },
    date: new Date(now - 3 * day),
    parents: ["feat00022"],
  },
  {
    hash: "feat00022",
    message: "feat(gallery): scaffold layout",
    author: { name: "Contributor" },
    date: new Date(now - 4 * day),
    parents: ["root00011"],
  },
  {
    hash: "root00011",
    message: "chore: initial scaffold",
    author: { name: "Hleb Tkachenko" },
    date: new Date(now - 7 * day),
    parents: [],
    tag: "v0.0.1",
  },
]

export function CommitGraphDemo() {
  return <CommitGraph commits={commits} />
}
