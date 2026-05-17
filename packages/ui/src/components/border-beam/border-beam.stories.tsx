import type { Meta, StoryObj } from "@storybook/react"
import { BorderBeam } from "./border-beam"

const meta: Meta<typeof BorderBeam> = {
  title: "Components/BorderBeam",
  component: BorderBeam,
}
export default meta

type Story = StoryObj<typeof BorderBeam>

const DemoCard = ({ label }: { label: string }) => (
  <div className="w-64 rounded-lg border border-border bg-card p-6 text-card-foreground">
    {label}
  </div>
)

export const Default: Story = {
  render: () => (
    <BorderBeam borderRadius={8}>
      <DemoCard label="Wrapped content" />
    </BorderBeam>
  ),
}

export const Medium: Story = {
  render: () => (
    <BorderBeam size="md" borderRadius={8}>
      <DemoCard label="Medium beam" />
    </BorderBeam>
  ),
}

export const Line: Story = {
  render: () => (
    <BorderBeam size="line" borderRadius={8}>
      <DemoCard label="Line beam" />
    </BorderBeam>
  ),
}

export const Ocean: Story = {
  render: () => (
    <BorderBeam colorVariant="ocean" borderRadius={8}>
      <DemoCard label="Ocean variant" />
    </BorderBeam>
  ),
}

export const Sunset: Story = {
  render: () => (
    <BorderBeam colorVariant="sunset" borderRadius={8}>
      <DemoCard label="Sunset variant" />
    </BorderBeam>
  ),
}

export const Mono: Story = {
  render: () => (
    <BorderBeam colorVariant="mono" staticColors borderRadius={8}>
      <DemoCard label="Mono variant" />
    </BorderBeam>
  ),
}

export const Inactive: Story = {
  render: () => (
    <BorderBeam active={false} borderRadius={8}>
      <DemoCard label="Inactive beam" />
    </BorderBeam>
  ),
}
