import type { Meta, StoryObj } from "@storybook/react"
import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import { MultiStepLoader, type FinalStatus } from "./multi-step-loader"

const meta: Meta<typeof MultiStepLoader> = {
  title: "Components/MultiStepLoader",
  component: MultiStepLoader,
}
export default meta
type Story = StoryObj<typeof MultiStepLoader>

const states = [
  { text: "Connecting to server" },
  { text: "Authenticating session" },
  { text: "Loading workspace" },
  { text: "Syncing preferences" },
  { text: "Almost ready" },
]

function Trigger({
  loop,
  finalStatus,
}: {
  loop: boolean
  finalStatus?: FinalStatus
}) {
  const [loading, setLoading] = React.useState(false)
  return (
    <div className="flex flex-col gap-4">
      <Button onClick={() => setLoading(true)}>Start loader</Button>
      <MultiStepLoader
        loadingStates={states}
        loading={loading}
        duration={1200}
        loop={loop}
        {...(finalStatus ? { finalStatus } : {})}
        autoCloseDelay={1500}
        onClose={() => setLoading(false)}
      />
    </div>
  )
}

export const Looping: Story = {
  render: () => <Trigger loop />,
}

export const OneShotSuccess: Story = {
  render: () => <Trigger loop={false} finalStatus="success" />,
}

export const OneShotFailed: Story = {
  render: () => <Trigger loop={false} finalStatus="failed" />,
}
