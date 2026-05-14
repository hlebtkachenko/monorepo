"use client"

import { useState } from "react"
import { Switch } from "@workspace/ui/components/switch"
import { Label } from "@workspace/ui/components/label"

export function SwitchDemo() {
  const [on, setOn] = useState(true)
  const [off, setOff] = useState(false)

  return (
    <div className="flex flex-wrap gap-6">
      <div className="flex items-center gap-2">
        <Switch
          id="sw-on"
          checked={on}
          onCheckedChange={setOn}
        />
        <Label htmlFor="sw-on">On</Label>
      </div>
      <div className="flex items-center gap-2">
        <Switch
          id="sw-off"
          checked={off}
          onCheckedChange={setOff}
        />
        <Label htmlFor="sw-off">Off</Label>
      </div>
      <div className="flex items-center gap-2">
        <Switch id="sw-disabled" disabled />
        <Label htmlFor="sw-disabled">Disabled</Label>
      </div>
    </div>
  )
}
