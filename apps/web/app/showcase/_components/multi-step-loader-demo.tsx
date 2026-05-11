"use client"

import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import {
  MultiStepLoader,
  type FinalStatus,
} from "@workspace/ui/components/multi-step-loader"

const states = [
  { text: "Connecting to server" },
  { text: "Authenticating session" },
  { text: "Loading workspace" },
  { text: "Syncing preferences" },
  { text: "Almost ready" },
]

export function MultiStepLoaderDemo() {
  const [mode, setMode] = React.useState<
    "none" | "loop" | "success" | "failed"
  >("none")

  const loading = mode !== "none"
  const loop = mode === "loop"
  const finalStatus: FinalStatus = mode === "failed" ? "failed" : "success"

  return (
    <div className="flex flex-wrap gap-3">
      <Button onClick={() => setMode("loop")}>Looping</Button>
      <Button variant="outline" onClick={() => setMode("success")}>
        One-shot (success)
      </Button>
      <Button variant="destructive" onClick={() => setMode("failed")}>
        One-shot (failed)
      </Button>
      <MultiStepLoader
        loadingStates={states}
        loading={loading}
        duration={1200}
        loop={loop}
        finalStatus={finalStatus}
        autoCloseDelay={1500}
        onClose={() => setMode("none")}
      />
    </div>
  )
}
