"use client"

import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import { MultiStepLoader } from "@workspace/ui/components/multi-step-loader"

const states = [
  { text: "Connecting to server" },
  { text: "Authenticating session" },
  { text: "Loading workspace" },
  { text: "Syncing preferences" },
  { text: "Almost ready" },
]

export function MultiStepLoaderDemo() {
  const [loading, setLoading] = React.useState(false)
  return (
    <div className="flex gap-3">
      <Button onClick={() => setLoading(true)}>Start loader</Button>
      <MultiStepLoader
        loadingStates={states}
        loading={loading}
        duration={1500}
        loop
      />
      {loading && (
        <Button variant="outline" onClick={() => setLoading(false)}>
          Stop
        </Button>
      )}
    </div>
  )
}
