import type { Meta, StoryObj } from "@storybook/react"
import { PasswordChecklist } from "./password-checklist"

const meta: Meta<typeof PasswordChecklist> = {
  title: "Components/PasswordChecklist",
  component: PasswordChecklist,
}
export default meta

type Story = StoryObj<typeof PasswordChecklist>

const labels = {
  length: "At least 12 characters",
  number: "Contains a number",
  symbol: "Contains a symbol",
  mixedCase: "Mix of upper & lower",
}

export const Empty: Story = {
  args: {
    value: "",
    labels,
  },
}

export const PartiallyValid: Story = {
  args: {
    value: "Password1",
    labels,
  },
}

export const AllValid: Story = {
  args: {
    value: "Str0ng!Password",
    labels,
  },
}
