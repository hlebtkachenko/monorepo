"use client"

import { useState } from "react"
import { Checkbox } from "@workspace/ui/components/checkbox"
import { Label } from "@workspace/ui/components/label"

export function CheckboxDemo() {
  const [checked, setChecked] = useState(true)
  const [unchecked, setUnchecked] = useState(false)

  return (
    <div className="flex flex-wrap gap-6">
      <div className="flex items-center gap-2">
        <Checkbox
          id="cb-checked"
          checked={checked}
          onCheckedChange={(v) => setChecked(!!v)}
        />
        <Label htmlFor="cb-checked">Checked</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox
          id="cb-unchecked"
          checked={unchecked}
          onCheckedChange={(v) => setUnchecked(!!v)}
        />
        <Label htmlFor="cb-unchecked">Unchecked</Label>
      </div>
      <div className="flex items-center gap-2">
        <Checkbox id="cb-disabled" disabled />
        <Label htmlFor="cb-disabled">Disabled</Label>
      </div>
    </div>
  )
}
