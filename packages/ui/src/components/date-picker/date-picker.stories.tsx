import type { Meta, StoryObj } from "@storybook/react"
import * as React from "react"
import { expect, userEvent, within } from "storybook/test"
import { DatePicker } from "./date-picker"

const meta: Meta<typeof DatePicker> = {
  title: "Components/DatePicker",
  component: DatePicker,
}
export default meta

type Story = StoryObj<typeof DatePicker>

export const Default: Story = {
  render: () => {
    const [date, setDate] = React.useState<Date | undefined>()
    return <DatePicker value={date} onValueChange={setDate} />
  },
  play: async ({ canvasElement }) => {
    const canvas = within(canvasElement)
    const today = canvas.getByRole("button", { name: "Today" })
    await userEvent.click(today)
    await expect(today).toBeInTheDocument()
  },
}

export const WithValue: Story = {
  render: () => {
    const [date, setDate] = React.useState<Date | undefined>(
      new Date(2025, 5, 12),
    )
    return <DatePicker value={date} onValueChange={setDate} />
  },
}

export const OrientationVertical: Story = {
  render: () => {
    const [date, setDate] = React.useState<Date | undefined>()
    return (
      <DatePicker value={date} onValueChange={setDate} orientation="vertical" />
    )
  },
}

export const OrientationHorizontal: Story = {
  render: () => {
    const [date, setDate] = React.useState<Date | undefined>()
    return (
      <DatePicker
        value={date}
        onValueChange={setDate}
        orientation="horizontal"
      />
    )
  },
}

export const NoPresets: Story = {
  render: () => {
    const [date, setDate] = React.useState<Date | undefined>()
    return <DatePicker value={date} onValueChange={setDate} presets={[]} />
  },
}
