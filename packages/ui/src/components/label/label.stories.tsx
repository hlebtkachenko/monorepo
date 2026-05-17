import type { Meta, StoryObj } from "@storybook/react"
import { Label } from "./label"

const meta: Meta<typeof Label> = {
  title: "Components/Label",
  component: Label,
}
export default meta
type Story = StoryObj<typeof Label>

export const Default: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <Label htmlFor="name">Full name</Label>
      <input id="name" type="text" placeholder="Your name" />
    </div>
  ),
}

export const Required: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <Label htmlFor="email">
        Email <span aria-hidden="true">*</span>
      </Label>
      <input id="email" type="email" required />
    </div>
  ),
}

export const Disabled: Story = {
  render: () => (
    <div className="flex flex-col gap-2">
      <Label htmlFor="disabled-input">Disabled field</Label>
      <input
        id="disabled-input"
        type="text"
        disabled
        placeholder="Cannot edit"
      />
    </div>
  ),
}
