import type { Meta, StoryObj } from "@storybook/react"

import { AppContextMenu } from "./app-context-menu"

const meta: Meta<typeof AppContextMenu> = {
  title: "Blocks/AppContextMenu",
  component: AppContextMenu,
  parameters: { layout: "fullscreen" },
}
export default meta

type Story = StoryObj<typeof AppContextMenu>

const SamplePage = () => (
  <div className="mx-auto max-w-2xl space-y-4 px-6 py-10 text-sm">
    <p className="text-muted-foreground">
      Right-click anywhere to open the app context menu. Shift + right-click
      bypasses to the native browser menu. Report bug opens a dialog with a type
      dropdown, comment input, and an animated submit.
    </p>
    <div data-slot="kpi-tile" className="rounded-md border border-border p-6">
      <h2 className="font-heading text-lg font-medium">Revenue (MTD)</h2>
      <p className="font-mono text-2xl">123 456 Kč</p>
    </div>
    <div
      data-slot="recent-activity"
      className="rounded-md border border-border p-6"
    >
      <h2 className="font-heading text-lg font-medium">Recent activity</h2>
      <p className="text-muted-foreground">No items.</p>
    </div>
  </div>
)

export const Default: Story = {
  args: {
    pathname: "/acme",
    orgSlug: "acme",
    user: { email: "owner@acme.test" },
    children: <SamplePage />,
  },
}

export const WithBugHandler: Story = {
  args: {
    pathname: "/acme/documents/invoices-received",
    orgSlug: "acme",
    user: { email: "owner@acme.test" },
    onReportBug: async (payload) => {
      console.info("[story] onReportBug payload", payload)
      // Pretend network latency so the Save button animation is visible.
      await new Promise((r) => setTimeout(r, 800))
      return {
        url: "https://linear.app/example/issue/AFF-123",
        identifier: "AFF-123",
      }
    },
    children: <SamplePage />,
  },
}

export const FailingBugHandler: Story = {
  args: {
    pathname: "/acme",
    orgSlug: "acme",
    user: { email: "owner@acme.test" },
    onReportBug: async () => {
      await new Promise((r) => setTimeout(r, 600))
      throw new Error("Linear is not configured (503).")
    },
    children: <SamplePage />,
  },
}
