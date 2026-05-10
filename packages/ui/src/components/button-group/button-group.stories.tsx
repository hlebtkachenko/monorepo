import type { Meta, StoryObj } from "@storybook/react"
import { ButtonGroup } from "./button-group"
import { Button } from "@workspace/ui/components/button"

const meta: Meta<typeof ButtonGroup> = {
  title: "Components/ButtonGroup",
  component: ButtonGroup,
}
export default meta

type Story = StoryObj<typeof ButtonGroup>

export const Default: Story = {
  render: () => (
    <ButtonGroup>
      <Button variant="outline">First</Button>
      <Button variant="outline">Second</Button>
      <Button variant="outline">Third</Button>
    </ButtonGroup>
  ),
}

export const Vertical: Story = {
  render: () => (
    <ButtonGroup orientation="vertical">
      <Button variant="outline">Top</Button>
      <Button variant="outline">Middle</Button>
      <Button variant="outline">Bottom</Button>
    </ButtonGroup>
  ),
}

export const Mixed: Story = {
  render: () => (
    <ButtonGroup>
      <Button>Primary</Button>
      <Button variant="outline">Secondary</Button>
      <Button variant="destructive">Delete</Button>
    </ButtonGroup>
  ),
}
