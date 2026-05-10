"use client"

import { LiquidMetalButton } from "@workspace/ui/components/liquid-metal-button"
import { Sparkles } from "lucide-react"

export function LiquidMetalDemo() {
  return (
    <div className="flex flex-wrap items-center gap-4">
      <LiquidMetalButton label="Get Started" />
      <LiquidMetalButton viewMode="icon" icon={<Sparkles />} label="Sparkle" />
    </div>
  )
}
