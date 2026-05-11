import type { Meta, StoryObj } from "@storybook/react"
import { EnvEditor } from "./env-editor"

const meta: Meta<typeof EnvEditor> = {
  title: "Components/EnvEditor",
  component: EnvEditor,
}
export default meta
type Story = StoryObj<typeof EnvEditor>

const sample = [
  { key: "DATABASE_URL", value: "postgres://user:pass@localhost:5432/app" },
  { key: "API_KEY", value: "sk_live_abc123" },
  { key: "NODE_ENV", value: "production" },
]

export const Default: Story = {
  args: { value: sample },
}

export const Empty: Story = {
  args: { value: [] },
}

export const Unmasked: Story = {
  args: { value: sample, masked: false },
}

export const ReadOnly: Story = {
  args: { value: sample, readOnly: true },
}
