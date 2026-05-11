import type { Meta, StoryObj } from "@storybook/react"
import { Marquee } from "./marquee"

const meta: Meta<typeof Marquee> = {
  title: "Components/Marquee",
  component: Marquee,
}
export default meta
type Story = StoryObj<typeof Marquee>

const items = [
  "next.js",
  "react",
  "typescript",
  "tailwind",
  "vitest",
  "storybook",
]

const Pill = ({ label }: { label: string }) => (
  <span className="inline-flex items-center rounded-full border border-border bg-muted px-3 py-1 text-sm">
    {label}
  </span>
)

const Row = () => (
  <>
    {items.map((label) => (
      <Pill key={label} label={label} />
    ))}
  </>
)

export const Default: Story = {
  render: () => (
    <Marquee className="max-w-xl">
      <Row />
    </Marquee>
  ),
}

export const Reverse: Story = {
  render: () => (
    <Marquee className="max-w-xl" reverse>
      <Row />
    </Marquee>
  ),
}

export const PauseOnHover: Story = {
  render: () => (
    <Marquee className="max-w-xl" pauseOnHover>
      <Row />
    </Marquee>
  ),
}

export const Vertical: Story = {
  render: () => (
    <Marquee className="h-48 max-w-xs" vertical>
      <Row />
    </Marquee>
  ),
}

export const Fast: Story = {
  render: () => (
    <Marquee
      className="max-w-xl"
      style={{ "--duration": "10s" } as React.CSSProperties}
    >
      <Row />
    </Marquee>
  ),
}
