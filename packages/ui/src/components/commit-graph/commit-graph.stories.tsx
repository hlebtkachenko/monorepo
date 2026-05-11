import type { Meta, StoryObj } from "@storybook/react"
import { CommitGraph } from "./commit-graph"

const meta: Meta<typeof CommitGraph> = {
  title: "Components/CommitGraph",
  component: CommitGraph,
}
export default meta
type Story = StoryObj<typeof CommitGraph>

const day = 24 * 60 * 60 * 1000
const now = Date.now()

const linear = [
  {
    hash: "f1a2c3d4e5",
    message: "feat(ui): add commit graph",
    author: { name: "Hleb Tkachenko" },
    date: new Date(now - day),
    parents: ["b2c3d4e5f6"],
    refs: ["main"],
  },
  {
    hash: "b2c3d4e5f6",
    message: "chore: bump dependencies",
    author: { name: "Hleb Tkachenko" },
    date: new Date(now - 2 * day),
    parents: ["c3d4e5f6a7"],
  },
  {
    hash: "c3d4e5f6a7",
    message: "fix: hydration mismatch in date",
    author: { name: "Hleb Tkachenko" },
    date: new Date(now - 3 * day),
    parents: ["d4e5f6a7b8"],
  },
  {
    hash: "d4e5f6a7b8",
    message: "feat: initial scaffold",
    author: { name: "Hleb Tkachenko" },
    date: new Date(now - 4 * day),
    parents: [],
    tag: "v0.1.0",
  },
]

const branched = [
  {
    hash: "merge001",
    message: "Merge feature branch into main",
    author: { name: "Maintainer" },
    date: new Date(now - 1 * day),
    parents: ["main001", "feat001"],
    refs: ["main"],
  },
  {
    hash: "main001",
    message: "Polish landing page",
    author: { name: "Maintainer" },
    date: new Date(now - 2 * day),
    parents: ["root000"],
  },
  {
    hash: "feat001",
    message: "Add gallery view",
    author: { name: "Contributor" },
    date: new Date(now - 3 * day),
    parents: ["feat002"],
  },
  {
    hash: "feat002",
    message: "Sketch gallery layout",
    author: { name: "Contributor" },
    date: new Date(now - 4 * day),
    parents: ["root000"],
  },
  {
    hash: "root000",
    message: "Initial commit",
    author: { name: "Hleb Tkachenko" },
    date: new Date(now - 7 * day),
    parents: [],
    tag: "v0.0.1",
  },
]

export const Linear: Story = {
  render: () => (
    <div className="w-full max-w-3xl">
      <CommitGraph commits={linear} />
    </div>
  ),
}

export const Branched: Story = {
  render: () => (
    <div className="w-full max-w-3xl">
      <CommitGraph commits={branched} />
    </div>
  ),
}

export const Empty: Story = {
  render: () => (
    <div className="w-full max-w-3xl">
      <CommitGraph commits={[]} />
    </div>
  ),
}
