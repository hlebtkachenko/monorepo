import type { Meta, StoryObj } from "@storybook/react"
import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import { MultiStepLoader } from "./multi-step-loader"

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

function Trigger({ loop }: { loop?: boolean }) {
  const [loading, setLoading] = React.useState(false)
  return (
    <div className="flex flex-col gap-4">
      <Button onClick={() => setLoading(true)}>Start loader</Button>
      <MultiStepLoader
        loadingStates={states}
        loading={loading}
        duration={1500}
        loop={!!loop}
      />
      {loading && (
        <Button variant="outline" onClick={() => setLoading(false)}>
          Stop
        </Button>
      )}
    </div>
  )
}

export const Looping: Story = {
  render: () => <Trigger loop />,
}

export const OneShot: Story = {
  render: () => <Trigger />,
}
