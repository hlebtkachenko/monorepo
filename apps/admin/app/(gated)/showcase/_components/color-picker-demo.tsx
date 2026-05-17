"use client"

import * as React from "react"

import { ColorPicker } from "@workspace/ui/components/color-picker"

export function ColorPickerDemo() {
  const [color, setColor] = React.useState("#007AFF")

  return (
    <div className="flex items-center gap-4">
      <ColorPicker color={color} onChange={setColor} />
      <span className="text-xs text-muted-foreground">{color}</span>
    </div>
  )
}
