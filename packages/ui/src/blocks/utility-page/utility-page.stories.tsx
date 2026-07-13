import type { Meta, StoryObj } from "@storybook/react"

import { NextIntlClientProvider } from "@workspace/i18n/client"
import messages from "@workspace/i18n/messages/en.json"

import { UtilityPage } from "./utility-page"
import { UTILITY_PAGE_IDS } from "./utility-page.types"

const meta = {
  title: "Blocks/Utility Page",
  component: UtilityPage,
  parameters: { layout: "fullscreen" },
  args: { state: "route_not_found" },
  argTypes: {
    state: { control: "select", options: UTILITY_PAGE_IDS },
  },
  decorators: [
    (Story) => (
      <NextIntlClientProvider locale="en" messages={messages}>
        <Story />
      </NextIntlClientProvider>
    ),
  ],
} satisfies Meta<typeof UtilityPage>

export default meta
type Story = StoryObj<typeof meta>

export const Catalog: Story = {}

export const ServerError: Story = {
  args: {
    state: "unexpected_server_error",
    runtime: {
      referenceId: "err_01J8Y3M7W2",
      onRetry: () => undefined,
      report: { payload: { message: "Example server error" } },
    },
  },
}

export const ShellAccessDenied: Story = {
  args: { state: "access_denied", runtime: { surface: "shell" } },
}

export const Offline: Story = {
  args: { state: "offline", runtime: { surface: "global" } },
}
