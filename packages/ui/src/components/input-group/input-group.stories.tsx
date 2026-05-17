import type { Meta, StoryObj } from "@storybook/react"
import {
  InputGroup,
  InputGroupInput,
  InputGroupText,
  InputGroupButton,
  InputGroupAddon,
} from "./input-group"

const meta: Meta<typeof InputGroup> = {
  title: "Components/InputGroup",
  component: InputGroup,
}
export default meta
type Story = StoryObj<typeof InputGroup>

export const Default: Story = {
  render: () => (
    <InputGroup>
      <InputGroupAddon align="inline-start">
        <InputGroupText>https://</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput placeholder="example.com" />
    </InputGroup>
  ),
}

export const WithButton: Story = {
  render: () => (
    <InputGroup>
      <InputGroupInput placeholder="Search..." />
      <InputGroupAddon align="inline-end">
        <InputGroupButton>Go</InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  ),
}

export const AlignInlineStart: Story = {
  render: () => (
    <InputGroup>
      <InputGroupAddon align="inline-start">
        <InputGroupText>$</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput placeholder="Amount" />
    </InputGroup>
  ),
}

export const AlignInlineEnd: Story = {
  render: () => (
    <InputGroup>
      <InputGroupInput placeholder="Search..." />
      <InputGroupAddon align="inline-end">
        <InputGroupText>.com</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  ),
}

export const AlignBlockStart: Story = {
  render: () => (
    <InputGroup>
      <InputGroupAddon align="block-start">
        <InputGroupText>Label</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput placeholder="Enter value" />
    </InputGroup>
  ),
}

export const AlignBlockEnd: Story = {
  render: () => (
    <InputGroup>
      <InputGroupInput placeholder="Enter value" />
      <InputGroupAddon align="block-end">
        <InputGroupText>Helper text</InputGroupText>
      </InputGroupAddon>
    </InputGroup>
  ),
}

export const SizeXs: Story = {
  render: () => (
    <InputGroup>
      <InputGroupInput placeholder="Search..." />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="xs">Go</InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  ),
}

export const SizeSm: Story = {
  render: () => (
    <InputGroup>
      <InputGroupInput placeholder="Search..." />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="sm">Go</InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  ),
}

export const SizeIconXs: Story = {
  render: () => (
    <InputGroup>
      <InputGroupInput placeholder="Search..." />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="icon-xs">+</InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  ),
}

export const SizeIconSm: Story = {
  render: () => (
    <InputGroup>
      <InputGroupInput placeholder="Search..." />
      <InputGroupAddon align="inline-end">
        <InputGroupButton size="icon-sm">+</InputGroupButton>
      </InputGroupAddon>
    </InputGroup>
  ),
}

export const Disabled: Story = {
  render: () => (
    <InputGroup>
      <InputGroupAddon align="inline-start">
        <InputGroupText>https://</InputGroupText>
      </InputGroupAddon>
      <InputGroupInput placeholder="example.com" disabled />
    </InputGroup>
  ),
}
