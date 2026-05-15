"use client"

import { Bold, Italic, Underline } from "lucide-react"
import { Toggle } from "@workspace/ui/components/toggle"

export function ToggleDemo() {
  return (
    <div className="flex flex-wrap gap-3">
      <Toggle aria-label="Bold">
        <Bold />
        Bold
      </Toggle>
      <Toggle aria-label="Italic" variant="outline">
        <Italic />
        Italic
      </Toggle>
      <Toggle aria-label="Underline" defaultPressed>
        <Underline />
        Underline
      </Toggle>
      <Toggle aria-label="Disabled" disabled>
        Disabled
      </Toggle>
    </div>
  )
}
