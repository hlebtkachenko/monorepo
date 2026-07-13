import type { Meta, StoryObj } from "@storybook/react"

import {
  StatCard,
  StatCardDelta,
  StatCardLabel,
  StatCardValue,
} from "./stat-card"

const meta: Meta<typeof StatCard> = {
  title: "Components/StatCard",
  component: StatCard,
}
export default meta
type Story = StoryObj<typeof StatCard>

function Example({ trend }: { trend: "up" | "down" | "flat" }) {
  return (
    <StatCard>
      <StatCardLabel>Open invoices</StatCardLabel>
      <StatCardValue>128</StatCardValue>
      <StatCardDelta trend={trend}>12% this month</StatCardDelta>
    </StatCard>
  )
}

export const Default: Story = { render: () => <Example trend="up" /> }
export const Down: Story = { render: () => <Example trend="down" /> }
export const Flat: Story = { render: () => <Example trend="flat" /> }
