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
} from "@workspace/ui/components/timeline"

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
    description: "Driver is on the way.",
  },
  {
    title: "Delivered",
    time: "Wed 11:45",
    description: "Signed for by Hleb.",
  },
]

export function TimelineDemo() {
  return (
    <Timeline activeIndex={2} className="max-w-md">
      {steps.map((s) => (
        <TimelineItem key={s.title}>
          <TimelineDot />
          <TimelineConnector />
          <TimelineContent>
            <TimelineHeader>
              <TimelineTitle>{s.title}</TimelineTitle>
              <TimelineTime>{s.time}</TimelineTime>
              <TimelineDescription>{s.description}</TimelineDescription>
            </TimelineHeader>
          </TimelineContent>
        </TimelineItem>
      ))}
    </Timeline>
  )
}
