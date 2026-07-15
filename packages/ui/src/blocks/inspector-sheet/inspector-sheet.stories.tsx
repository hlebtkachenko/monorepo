import type { Meta, StoryObj } from "@storybook/react"
import * as React from "react"

import { IconProvider } from "@workspace/ui/icon-packs"

import { InspectorSheet } from "./inspector-sheet"
import type { InspectorFlagValue } from "./inspector-flag-picker"
import type { InspectorTab } from "./inspector-rail"

const meta: Meta<typeof InspectorSheet> = {
  title: "Blocks/InspectorSheet",
  parameters: { layout: "fullscreen" },
  decorators: [
    (Story) => (
      <IconProvider>
        <div className="h-[560px] w-[420px] border border-border-subtle bg-shell-surface">
          <Story />
        </div>
      </IconProvider>
    ),
  ],
}
export default meta

type Story = StoryObj<typeof InspectorSheet>

function DefaultDemo() {
  const [name, setName] = React.useState("Invoice #2026-014")
  const [flag, setFlag] = React.useState<InspectorFlagValue>({
    tone: "warning",
  })
  const [tab, setTab] = React.useState<InspectorTab>("details")

  return (
    <InspectorSheet
      breadcrumb={["Invoices", "Issued"]}
      onCopy={() => {}}
      onSwitchLayout={() => {}}
      onClose={() => {}}
      name={name}
      onNameChange={setName}
      flag={flag}
      onFlagChange={setFlag}
      badge={{ label: "Draft", variant: "secondary" }}
      activeTab={tab}
      onTabChange={setTab}
      content={{
        details: <div className="text-sm">Details content.</div>,
        activity: <div className="text-sm">Activity content.</div>,
      }}
      footer={{
        declineLabel: "Reject",
        approveLabel: "Approve",
        onDecline: () => {},
        onApprove: () => {},
      }}
    />
  )
}

export const Default: Story = {
  render: () => <DefaultDemo />,
}
