import type { Meta, StoryObj } from "@storybook/react"

import {
  AuthShellChromeAside,
  AuthShellChromeFooter,
} from "./auth-shell-chrome"

const FOOTER_LABELS = {
  privacy: "Privacy",
  terms: "Terms",
  status: "Status",
}

const meta = {
  title: "Blocks/Auth/AuthShellChrome",
  component: AuthShellChromeFooter,
  parameters: { layout: "padded" },
} satisfies Meta<typeof AuthShellChromeFooter>

export default meta
type Story = StoryObj<typeof meta>

export const Footer: Story = {
  args: {
    brand: "Afframe",
    version: "v0.2.0",
    labels: FOOTER_LABELS,
  },
}

export const FooterXs: Story = {
  args: {
    brand: "Afframe",
    version: "v0.2.0",
    labels: FOOTER_LABELS,
    size: "xs",
  },
}

export const FooterWithTrailingSlot: Story = {
  args: {
    brand: "Afframe",
    version: "dev",
    labels: FOOTER_LABELS,
    children: <span className="text-muted-foreground">EN</span>,
  },
}

export const Aside: StoryObj = {
  render: () => (
    <div className="h-[640px] w-[480px]">
      <AuthShellChromeAside
        image=""
        headline="Accounting that keeps up with you"
        subtitle="Afframe is the agent-native platform for Czech accounting teams."
        quote={{
          text: "We closed the month in half the time.",
          author: "Jana Novakova",
          role: "Head of Accounting",
        }}
        partnersLabel="Teams working with Afframe"
      />
    </div>
  ),
}
