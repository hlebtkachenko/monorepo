import type { Meta, StoryObj } from "@storybook/react"
import { DataTrack } from "./data-track"

const meta: Meta<typeof DataTrack> = {
  title: "Components/DataTrack",
  component: DataTrack,
}
export default meta

type Story = StoryObj<typeof DataTrack>

const listData = [
  { name: "Consulting", value: 184000 },
  { name: "Licenses", value: 121500 },
  { name: "Support", value: 73200 },
  { name: "Training", value: 38900 },
]

const linkedData = [
  { name: "GitHub", value: 4210, href: "https://github.com" },
  { name: "Stripe", value: 2870, href: "https://stripe.com" },
  { name: "Vercel", value: 1650, href: "https://vercel.com" },
]

const trackerData = Array.from({ length: 24 }, (_, i) => ({
  key: i,
  color: i % 7 === 0 ? "var(--chart-4)" : "var(--chart-2)",
  tooltip: i % 7 === 0 ? "Degraded" : "Operational",
}))

export const List: Story = {
  render: () => (
    <div className="w-96">
      <DataTrack variant="list" data={listData} />
    </div>
  ),
}

export const ListSortAscending: Story = {
  render: () => (
    <div className="w-96">
      <DataTrack variant="list" data={listData} sortOrder="ascending" />
    </div>
  ),
}

export const ListWithValueFormatter: Story = {
  render: () => (
    <div className="w-96">
      <DataTrack
        variant="list"
        data={listData}
        valueFormatter={(v) => `${(v / 1000).toFixed(1)}k Kč`}
      />
    </div>
  ),
}

export const ListWithLinks: Story = {
  render: () => (
    <div className="w-96">
      <DataTrack variant="list" data={linkedData} />
    </div>
  ),
}

export const ListInteractive: Story = {
  render: () => (
    <div className="w-96">
      <DataTrack
        variant="list"
        data={listData}
        onValueChange={(item) => alert(`Clicked: ${item.name}`)}
      />
    </div>
  ),
}

export const Tracker: Story = {
  render: () => (
    <div className="w-96">
      <DataTrack variant="tracker" data={trackerData} />
    </div>
  ),
}

export const TrackerHoverEffect: Story = {
  render: () => (
    <div className="w-96">
      <DataTrack variant="tracker" data={trackerData} hoverEffect />
    </div>
  ),
}
