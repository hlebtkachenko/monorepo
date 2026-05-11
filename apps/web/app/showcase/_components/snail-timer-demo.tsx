"use client"

import * as React from "react"

import { Button } from "@workspace/ui/components/button"
import { SnailTimer } from "@workspace/ui/components/snail-timer"

export function SnailTimerDemo() {
  const [resetKey, setResetKey] = React.useState(0)
  return (
    <div className="w-full max-w-xl rounded-lg border border-border p-6">
      <SnailTimer key={resetKey} initialSeconds={30} />
      <div className="mt-4">
        <Button
          size="sm"
          variant="outline"
          onClick={() => setResetKey((k) => k + 1)}
        >
          Restart
        </Button>
      </div>
    </div>
  )
}
