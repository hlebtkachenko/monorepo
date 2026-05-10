import type { Meta, StoryObj } from "@storybook/react"
import { Field, FieldLabel, FieldDescription } from "./field"

const meta: Meta<typeof Field> = {
  title: "Components/Field",
  component: Field,
}
export default meta
type Story = StoryObj<typeof Field>

export const Default: Story = {
  render: () => (
    <Field>
      <FieldLabel htmlFor="email">Email</FieldLabel>
      <input id="email" type="email" placeholder="you@example.com" />
      <FieldDescription>We will never share your email.</FieldDescription>
    </Field>
  ),
}

export const Horizontal: Story = {
  render: () => (
    <Field orientation="horizontal">
      <FieldLabel htmlFor="name">Name</FieldLabel>
      <input id="name" type="text" placeholder="Your name" />
    </Field>
  ),
}
