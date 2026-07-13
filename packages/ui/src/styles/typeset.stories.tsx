import type { Meta, StoryObj } from "@storybook/react"

const meta = {
  title: "Styles/Typeset",
} satisfies Meta

export default meta
type Story = StoryObj<typeof meta>

export const Default: Story = {
  render: () => (
    <article className="typeset max-w-2xl rounded-lg border p-6">
      <h1>Quarterly close review</h1>
      <p>
        Typeset applies theme-aware typography and stable vertical rhythm to
        plain HTML and rendered Markdown.
      </p>
      <blockquote>
        Streaming content can append without restyling blocks already on screen.
      </blockquote>
      <h2>Review checklist</h2>
      <ul>
        <li>Confirm the journal is balanced.</li>
        <li>Resolve outstanding approvals.</li>
        <li>Publish the close package.</li>
      </ul>
      <p>
        Inline <code>Money&lt;Currency&gt;</code> values and{" "}
        <mark>important</mark>
        notes inherit Afframe theme tokens.
      </p>
    </article>
  ),
}
