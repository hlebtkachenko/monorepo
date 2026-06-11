import type { Meta, StoryObj } from "@storybook/react"

import {
  AuthTokenContinueCard,
  AuthTokenInvalidCard,
} from "./token-landing-cards"

const meta = {
  title: "Blocks/Auth/TokenLandingCards",
  component: AuthTokenContinueCard,
  parameters: { layout: "padded" },
} satisfies Meta<typeof AuthTokenContinueCard>

export default meta
type Story = StoryObj<typeof meta>

export const Continue: Story = {
  args: {
    title: "You're almost there",
    description: "Continue to set up your account.",
    continueLabel: "Continue",
    action: "/auth/signup/consume",
    token: "raw-token",
    footnote: "Afframe",
  },
}

export const ContinueWithoutFootnote: Story = {
  args: {
    title: "You're almost there",
    description: "Continue to join the workspace.",
    continueLabel: "Continue",
    action: "/auth/invite/consume",
    token: "raw-token",
  },
}

export const Invalid: StoryObj = {
  render: () => (
    <AuthTokenInvalidCard
      title="This link is no longer valid"
      description="The link may have expired or already been used."
      contactLabel="Contact support"
      contactHref="#"
    />
  ),
}
