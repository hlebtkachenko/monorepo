import type { Meta, StoryObj } from "@storybook/react"
import { JsonViewer } from "./json-viewer"

const meta: Meta<typeof JsonViewer> = {
  title: "Components/JsonViewer",
  component: JsonViewer,
}
export default meta
type Story = StoryObj<typeof JsonViewer>

const sample = {
  id: 42,
  name: "Hleb",
  active: true,
  roles: ["admin", "owner"],
  profile: {
    email: "hleb@example.com",
    locale: "cs-CZ",
    settings: { theme: "dark", notifications: null },
  },
}

export const Default: Story = {
  args: { data: sample },
}

export const Collapsed: Story = {
  args: { data: sample, collapsed: true },
}

export const CollapsedAtDepth: Story = {
  args: { data: sample, collapsed: 1 },
}

export const Searchable: Story = {
  args: { data: sample, searchable: true },
}

export const WithoutCopyPath: Story = {
  args: { data: sample, copyPath: false },
}

export const MaxDepth: Story = {
  args: { data: sample, maxDepth: 2 },
}

export const ScalarString: Story = {
  args: { data: "plain string value" },
}

export const ScalarArray: Story = {
  args: { data: [1, 2, 3, "four", true, null] },
}
