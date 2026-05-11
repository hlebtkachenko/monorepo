import type { Meta, StoryObj } from "@storybook/react"
import {
  Gauge,
  GaugeIndicator,
  GaugeLabel,
  GaugeRange,
  GaugeTrack,
  GaugeValueText,
} from "./gauge"

const meta: Meta<typeof Gauge> = {
  title: "Components/Gauge",
  component: Gauge,
}
export default meta
type Story = StoryObj<typeof Gauge>

function Composed({
  value,
  label,
  startAngle,
  endAngle,
}: {
  value: number | null
  label?: string
  startAngle?: number
  endAngle?: number
}) {
  return (
    <Gauge
      value={value}
      {...(startAngle !== undefined ? { startAngle } : {})}
      {...(endAngle !== undefined ? { endAngle } : {})}
    >
      <GaugeIndicator>
        <GaugeTrack />
        <GaugeRange />
      </GaugeIndicator>
      <GaugeValueText />
      {label && <GaugeLabel>{label}</GaugeLabel>}
    </Gauge>
  )
}

export const Default: Story = {
  render: () => <Composed value={62} />,
}

export const Indeterminate: Story = {
  render: () => <Composed value={null} label="Loading" />,
}

export const Complete: Story = {
  render: () => <Composed value={100} label="Done" />,
}

export const SemiCircle: Story = {
  render: () => (
    <Composed value={42} startAngle={-90} endAngle={90} label="Speed" />
  ),
}

export const ThreeQuarter: Story = {
  render: () => (
    <Composed value={75} startAngle={-135} endAngle={135} label="Battery" />
  ),
}

export const Custom: Story = {
  render: () => (
    <Gauge value={70} size={160} thickness={12}>
      <GaugeIndicator>
        <GaugeTrack />
        <GaugeRange className="text-success" />
      </GaugeIndicator>
      <GaugeValueText />
      <GaugeLabel>Health</GaugeLabel>
    </Gauge>
  ),
}
