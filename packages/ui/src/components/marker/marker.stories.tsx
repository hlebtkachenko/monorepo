import type { Meta, StoryObj } from "@storybook/react"

import { Marker, MarkerContent } from "./marker"

const meta: Meta<typeof Marker> = {
  title: "Components/Marker",
  component: Marker,
}
export default meta
type Story = StoryObj<typeof Marker>

export const Default: Story = {
  render: () => (
    <Marker>
      <MarkerContent>Generating response...</MarkerContent>
    </Marker>
  ),
}
export const Separator: Story = {
  render: () => (
    <Marker variant="separator">
      <MarkerContent>Today</MarkerContent>
    </Marker>
  ),
}
export const Border: Story = {
  render: () => (
    <Marker variant="border">
      <MarkerContent>Tool completed</MarkerContent>
    </Marker>
  ),
}
