import type { Meta, StoryObj } from "@storybook/react"
import { Text } from "./text"
import { Heading } from "@workspace/ui/components/heading"

const meta: Meta<typeof Text> = {
  title: "Typography/Text",
  component: Text,
}
export default meta

type Story = StoryObj<typeof Text>

export const Default: Story = {
  args: {
    children:
      "The king thought long and hard, and finally came up with a brilliant plan: he would tax the jokes in the kingdom.",
  },
}

export const Lead: Story = {
  args: {
    variant: "lead",
    children:
      "A modal dialog that interrupts the user with important content and expects a response.",
  },
}

export const Large: Story = {
  args: { variant: "large", children: "Are you absolutely sure?" },
}

export const Small: Story = {
  args: { variant: "small", children: "Email address" },
}

export const Muted: Story = {
  args: { variant: "muted", children: "Enter your email address." },
}

export const Blockquote: Story = {
  args: {
    variant: "blockquote",
    children:
      "After all, everyone enjoys a good joke, so it's only fair that they should pay for the privilege.",
  },
}

export const InlineCode: Story = {
  args: { variant: "inline-code", children: "@radix-ui/react-alert-dialog" },
}

export const Subtle: Story = {
  args: {
    variant: "subtle",
    children: "Secondary information at 60% opacity.",
  },
}

export const Caption: Story = {
  args: {
    variant: "caption",
    children: "Figure 1: Revenue breakdown by quarter",
  },
}

export const Overline: Story = {
  args: { variant: "overline", children: "Section Label" },
}

export const AllVariants: Story = {
  render: () => (
    <div className="space-y-6">
      <div>
        <Text variant="overline">Default (paragraph)</Text>
        <Text>
          The king, seeing how much happier his subjects were, realized the
          error of his ways and repealed the joke tax.
        </Text>
      </div>
      <div>
        <Text variant="overline">Lead</Text>
        <Text variant="lead">
          A modal dialog that interrupts the user with important content.
        </Text>
      </div>
      <div>
        <Text variant="overline">Large</Text>
        <Text variant="large">Are you absolutely sure?</Text>
      </div>
      <div>
        <Text variant="overline">Small</Text>
        <Text variant="small">Email address</Text>
      </div>
      <div>
        <Text variant="overline">Muted</Text>
        <Text variant="muted">Enter your email address.</Text>
      </div>
      <div>
        <Text variant="overline">Subtle (60% opacity)</Text>
        <Text variant="subtle">
          Secondary information that fades into the background.
        </Text>
      </div>
      <div>
        <Text variant="overline">Caption</Text>
        <Text variant="caption">Figure 1: Revenue breakdown by quarter</Text>
      </div>
      <div>
        <Text variant="overline">Overline</Text>
        <Text variant="overline">Section Label</Text>
      </div>
      <div>
        <Text variant="overline">Blockquote</Text>
        <Text variant="blockquote">
          After all, everyone enjoys a good joke, so it&apos;s only fair that
          they should pay for the privilege.
        </Text>
      </div>
      <div>
        <Text variant="overline">Inline Code</Text>
        <Text>
          Use the{" "}
          <Text variant="inline-code">@radix-ui/react-alert-dialog</Text>{" "}
          package.
        </Text>
      </div>
    </div>
  ),
}

export const ArticleComposition: Story = {
  name: "Full Article",
  render: () => (
    <article className="max-w-2xl">
      <Heading level={1}>Taxing Laughter: The Joke Tax Chronicles</Heading>
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
        but the king was firm in his decision. He even went so far as to use{" "}
        <Text variant="inline-code">joke-tax-cli</Text> to automate collections.
      </Text>
      <Heading level={4}>People Stopped Telling Jokes</Heading>
      <Text>
        The people of the kingdom, burdened by the joke tax, stopped telling
        jokes altogether.
      </Text>
      <Text variant="muted">
        This is a work of fiction. Any resemblance to actual events is entirely
        coincidental.
      </Text>
    </article>
  ),
}
