import type { Meta, StoryObj } from "@storybook/react"
import { Heading } from "./heading"
import { Text } from "@workspace/ui/components/text"

const meta: Meta<typeof Heading> = {
  title: "Typography/Heading",
  component: Heading,
}
export default meta

type Story = StoryObj<typeof Heading>

export const H1: Story = {
  args: { level: 1, children: "Taxing Laughter: The Joke Tax Chronicles" },
}

export const H2: Story = {
  args: { level: 2, children: "The King's Plan" },
}

export const H3: Story = {
  args: { level: 3, children: "The Joke Tax" },
}

export const H4: Story = {
  args: { level: 4, children: "People Stopped Telling Jokes" },
}

export const AllLevels: Story = {
  render: () => (
    <div className="space-y-6">
      <Heading level={1}>Heading Level 1 (text-4xl, font-extrabold)</Heading>
      <Heading level={2}>Heading Level 2 (text-3xl, font-semibold)</Heading>
      <Heading level={3}>Heading Level 3 (text-2xl, font-semibold)</Heading>
      <Heading level={4}>Heading Level 4 (text-xl, font-semibold)</Heading>
    </div>
  ),
}

export const WithBody: Story = {
  name: "Heading + Body Text",
  render: () => (
    <div>
      <Heading level={1}>Taxing Laughter</Heading>
      <Text variant="lead">
        Once upon a time, in a far-off land, there was a very lazy king who
        spent all day lounging on his throne.
      </Text>
      <Heading level={2}>The King&apos;s Plan</Heading>
      <Text>
        The king thought long and hard, and finally came up with a brilliant
        plan: he would tax the jokes in the kingdom.
      </Text>
      <Text variant="blockquote">
        After all, everyone enjoys a good joke, so it&apos;s only fair that they
        should pay for the privilege.
      </Text>
      <Heading level={3}>The Joke Tax</Heading>
      <Text>
        The king&apos;s subjects were not amused. They grumbled and complained,
        but the king was firm in his decision.
      </Text>
      <Heading level={4}>People Stopped Telling Jokes</Heading>
      <Text variant="muted">
        This is a work of fiction. Any resemblance to actual events is entirely
        coincidental.
      </Text>
    </div>
  ),
}

export const CustomClassName: Story = {
  args: {
    level: 1,
    children: "Custom styled heading",
    className: "text-primary",
  },
}
