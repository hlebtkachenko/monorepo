import type { Meta, StoryObj } from "@storybook/react"
import * as React from "react"
import { Calendar } from "./calendar"

const meta: Meta<typeof Calendar> = {
  title: "Components/Calendar",
  component: Calendar,
}
export default meta

type Story = StoryObj<typeof Calendar>

export const Default: Story = {
  render: () => <Calendar mode="single" />,
}

export const WithSelectedDate: Story = {
  render: () => {
    const [date, setDate] = React.useState<Date | undefined>(
      new Date(2024, 0, 15),
    )
    return <Calendar mode="single" selected={date} onSelect={setDate} />
  },
}

export const RangeSelection: Story = {
  render: () => {
    const [range, setRange] = React.useState<
      { from: Date; to?: Date } | undefined
    >()
    return <Calendar mode="range" selected={range} onSelect={setRange as any} />
  },
}

export const DropdownCaption: Story = {
  render: () => (
    <Calendar
      mode="single"
      captionLayout="dropdown"
      startMonth={new Date(2020, 0)}
      endMonth={new Date(2030, 11)}
    />
  ),
}
