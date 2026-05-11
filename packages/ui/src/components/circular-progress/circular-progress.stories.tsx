import type { Meta, StoryObj } from "@storybook/react"
import {
  CircularProgress,
  CircularProgressIndicator,
  CircularProgressRange,
  CircularProgressTrack,
  CircularProgressValueText,
} from "./circular-progress"

const meta: Meta<typeof CircularProgress> = {
  title: "Components/CircularProgress",
  component: CircularProgress,
}
export default meta
type Story = StoryObj<typeof CircularProgress>

function Composed({
  value,
  size,
  thickness,
}: {
  value: number | null
  size?: number
  thickness?: number
}) {
  return (
    <CircularProgress
      value={value}
      {...(size !== undefined ? { size } : {})}
      {...(thickness !== undefined ? { thickness } : {})}
    >
      <CircularProgressIndicator>
        <CircularProgressTrack />
        <CircularProgressRange />
      </CircularProgressIndicator>
      <CircularProgressValueText />
    </CircularProgress>
  )
}

export const Default: Story = {
  render: () => <Composed value={62} />,
}

export const Indeterminate: Story = {
  render: () => <Composed value={null} />,
}

export const Complete: Story = {
  render: () => <Composed value={100} />,
}

export const Large: Story = {
  render: () => <Composed value={75} size={120} thickness={10} />,
}

export const Custom: Story = {
  render: () => (
    <CircularProgress value={88} size={96} thickness={8}>
      <CircularProgressIndicator>
        <CircularProgressTrack />
        <CircularProgressRange className="text-success" />
      </CircularProgressIndicator>
      <CircularProgressValueText className="text-success" />
    </CircularProgress>
  ),
}
