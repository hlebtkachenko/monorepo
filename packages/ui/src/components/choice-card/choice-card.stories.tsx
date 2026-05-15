import type { Meta, StoryObj } from "@storybook/react"
import { useState } from "react"
import { Smile, BookOpen, Layers, Shield } from "lucide-react"

import { RadioGroup } from "@workspace/ui/components/radio-group"
import { ChoiceCard, ChoiceCardGrid } from "./choice-card"

const meta: Meta<typeof ChoiceCard> = {
  title: "Components/ChoiceCard",
  component: ChoiceCard,
  decorators: [
    (Story) => (
      <div className="max-w-lg p-4">
        <Story />
      </div>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof ChoiceCard>

export const Default: Story = {
  render: () => (
    <RadioGroup defaultValue="">
      <ChoiceCard
        value="new"
        title="New to accounting"
        description="Show me plain-language guidance"
        icon={<Smile />}
      />
    </RadioGroup>
  ),
}

export const Selected: Story = {
  render: () => (
    <RadioGroup defaultValue="new">
      <ChoiceCard
        value="new"
        title="New to accounting"
        description="Show me plain-language guidance"
        icon={<Smile />}
      />
    </RadioGroup>
  ),
}

export const Grid2x2: Story = {
  render: function Grid2x2Story() {
    const [value, setValue] = useState("new")
    return (
      <RadioGroup value={value} onValueChange={setValue}>
        <ChoiceCardGrid columns={2}>
          <ChoiceCard
            value="new"
            title="New to accounting"
            description="Show me plain-language guidance"
            icon={<Smile />}
          />
          <ChoiceCard
            value="some"
            title="Some experience"
            description="I know the basics"
            icon={<BookOpen />}
          />
          <ChoiceCard
            value="experienced"
            title="Experienced"
            description="I work with accountants daily"
            icon={<Layers />}
          />
          <ChoiceCard
            value="expert"
            title="Expert"
            description="I am an accountant"
            icon={<Shield />}
          />
        </ChoiceCardGrid>
      </RadioGroup>
    )
  },
}

export const Grid1x2: Story = {
  render: function Grid1x2Story() {
    const [value, setValue] = useState("personal")
    return (
      <RadioGroup value={value} onValueChange={setValue}>
        <ChoiceCardGrid columns={1}>
          <ChoiceCard
            value="personal"
            title="Personal use"
            description="Track my own finances"
            icon={<Smile />}
          />
          <ChoiceCard
            value="business"
            title="Business use"
            description="Manage a company or clients"
            icon={<BookOpen />}
          />
        </ChoiceCardGrid>
      </RadioGroup>
    )
  },
}
