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

export const OrientationVertical: Story = {
  render: () => (
    <Field orientation="vertical">
      <FieldLabel htmlFor="email-v">Email</FieldLabel>
      <input id="email-v" type="email" placeholder="you@example.com" />
      <FieldDescription>We will never share your email.</FieldDescription>
    </Field>
  ),
}

export const OrientationHorizontal: Story = {
  render: () => (
    <Field orientation="horizontal">
      <FieldLabel htmlFor="name-h">Name</FieldLabel>
      <input id="name-h" type="text" placeholder="Your name" />
    </Field>
  ),
}

export const OrientationResponsive: Story = {
  render: () => (
    <Field orientation="responsive">
      <FieldLabel htmlFor="city-r">City</FieldLabel>
      <input id="city-r" type="text" placeholder="Your city" />
      <FieldDescription>Stacks vertically on small screens.</FieldDescription>
    </Field>
  ),
}
