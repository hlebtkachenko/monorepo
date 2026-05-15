"use client"

import { useState } from "react"
import { Slider } from "@workspace/ui/components/slider"

export function SliderDemo() {
  const [value, setValue] = useState([40])
  const [range, setRange] = useState([20, 70])

  return (
    <div className="flex flex-col gap-6 max-w-sm">
      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">Single: {value[0]}%</span>
        <Slider value={value} onValueChange={setValue} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">Range: {range[0]}% – {range[1]}%</span>
        <Slider value={range} onValueChange={setRange} />
      </div>
      <div className="flex flex-col gap-2">
        <span className="text-xs text-muted-foreground">Disabled</span>
        <Slider defaultValue={[60]} disabled />
      </div>
    </div>
  )
}
