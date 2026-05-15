import type { Meta, StoryObj } from "@storybook/react"
import { useState } from "react"

import { RadioGroup } from "@workspace/ui/components/radio-group"
import { PlanCard } from "./plan-card"

const meta: Meta<typeof PlanCard> = {
  title: "Components/PlanCard",
  component: PlanCard,
  decorators: [
    (Story) => (
      <div className="max-w-xl p-4">
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof PlanCard>

export const Single: Story = {
  render: () => (
    <RadioGroup defaultValue="starter">
      <PlanCard
        value="starter"
        name="Starter"
        description="Everything to get one workspace running."
        features={["1 company", "Up to 3 seats", "Core reports"]}
        price={{ amount: "$0", period: "/mo" }}
      />
    </RadioGroup>
  ),
}

export const WithBadge: Story = {
  render: () => (
    <RadioGroup defaultValue="growth">
      <PlanCard
        value="growth"
        name="Growth"
        description="For teams that need more power."
        features={[
          "5 companies",
          "Up to 15 seats",
          "Advanced reports",
          "Priority support",
        ]}
        price={{ amount: "$24", period: "/mo" }}
        badge="Most popular"
      />
    </RadioGroup>
  ),
}

export const All3Stacked: Story = {
  render: function All3StackedStory() {
    const [value, setValue] = useState("growth")
    return (
      <RadioGroup value={value} onValueChange={setValue} className="gap-3">
        <PlanCard
          value="starter"
          name="Starter"
          description="Everything to get one workspace running."
          features={["1 company", "Up to 3 seats", "Core reports"]}
          price={{ amount: "$0", period: "/mo" }}
        />
        <PlanCard
          value="growth"
          name="Growth"
          description="For teams that need more power."
          features={[
            "5 companies",
            "Up to 15 seats",
            "Advanced reports",
            "Priority support",
          ]}
          price={{ amount: "$24", period: "/mo" }}
          badge="Most popular"
        />
        <PlanCard
          value="scale"
          name="Scale"
          description="Unlimited everything for large practices."
          features={[
            "Unlimited companies",
            "Unlimited seats",
            "Custom reports",
            "Dedicated support",
          ]}
          price={{ amount: "$79", period: "/mo" }}
        />
      </RadioGroup>
    )
  },
}
