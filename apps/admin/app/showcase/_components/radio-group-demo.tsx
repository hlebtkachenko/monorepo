"use client"

import { useState } from "react"
import { RadioGroup, RadioGroupItem } from "@workspace/ui/components/radio-group"
import { Label } from "@workspace/ui/components/label"

export function RadioGroupDemo() {
  const [value, setValue] = useState("monthly")

  return (
    <RadioGroup value={value} onValueChange={setValue} className="w-fit gap-3">
      <div className="flex items-center gap-2">
        <RadioGroupItem id="rg-monthly" value="monthly" />
        <Label htmlFor="rg-monthly">Monthly</Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem id="rg-yearly" value="yearly" />
        <Label htmlFor="rg-yearly">Yearly</Label>
      </div>
      <div className="flex items-center gap-2">
        <RadioGroupItem id="rg-lifetime" value="lifetime" />
        <Label htmlFor="rg-lifetime">Lifetime</Label>
      </div>
    </RadioGroup>
  )
}
