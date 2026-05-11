import type { Meta, StoryObj } from "@storybook/react"
import {
  Timeline,
  TimelineConnector,
  TimelineContent,
  TimelineDescription,
  TimelineDot,
  TimelineHeader,
  TimelineItem,
  TimelineTime,
  TimelineTitle,
} from "./timeline"

const meta: Meta<typeof Timeline> = {
  title: "Components/Timeline",
  component: Timeline,
}
export default meta
type Story = StoryObj<typeof Timeline>

const steps = [
  {
    title: "Order placed",
    time: "Mon 10:00",
    description: "We received your order and started preparing it.",
  },
  {
    title: "Packed",
    time: "Mon 14:20",
    description: "Order packed and ready for the courier.",
  },
  {
    title: "Shipped",
    time: "Tue 08:05",
    description: "Picked up by the carrier.",
  },
  {
    title: "Out for delivery",
    time: "Wed 09:30",
    description: "Driver is on the way to your address.",
  },
  {
    title: "Delivered",
    time: "Wed 11:45",
    description: "Signed for by Hleb.",
  },
]

function Item({ step }: { step: (typeof steps)[number] }) {
  return (
    <TimelineItem>
      <TimelineDot />
      <TimelineConnector />
      <TimelineContent>
        <TimelineHeader>
          <TimelineTitle>{step.title}</TimelineTitle>
          <TimelineTime>{step.time}</TimelineTime>
          <TimelineDescription>{step.description}</TimelineDescription>
        </TimelineHeader>
      </TimelineContent>
    </TimelineItem>
  )
}

export const Default: Story = {
  render: () => (
    <Timeline activeIndex={2}>
      {steps.map((s) => (
        <Item key={s.title} step={s} />
      ))}
    </Timeline>
  ),
}

export const Horizontal: Story = {
  render: () => (
    <Timeline orientation="horizontal" activeIndex={2} className="max-w-3xl">
      {steps.map((s) => (
        <Item key={s.title} step={s} />
      ))}
    </Timeline>
  ),
}

export const Alternate: Story = {
  render: () => (
    <Timeline variant="alternate" activeIndex={2} className="max-w-md">
      {steps.map((s) => (
        <Item key={s.title} step={s} />
      ))}
    </Timeline>
  ),
}

export const AllPending: Story = {
  render: () => (
    <Timeline>
      {steps.map((s) => (
        <Item key={s.title} step={s} />
      ))}
    </Timeline>
  ),
}

export const AllCompleted: Story = {
  render: () => (
    <Timeline activeIndex={steps.length}>
      {steps.map((s) => (
        <Item key={s.title} step={s} />
      ))}
    </Timeline>
  ),
}
