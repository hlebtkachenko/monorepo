"use client"

import { LiquidMetalButton } from "@workspace/ui/components/button-liquid-metal"
import { Sparkles } from "lucide-react"

export function LiquidMetalDemo() {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <LiquidMetalButton>Default</LiquidMetalButton>
      <LiquidMetalButton variant="outline">Outline</LiquidMetalButton>
      <LiquidMetalButton variant="secondary">Secondary</LiquidMetalButton>
      <LiquidMetalButton size="icon" aria-label="Sparkle">
        <Sparkles />
      </LiquidMetalButton>
    </div>
  )
}
