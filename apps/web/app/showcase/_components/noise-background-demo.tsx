"use client"

import { NoiseBackground } from "@workspace/ui/components/noise-background"

export function NoiseBackgroundDemo() {
  return (
    <div className="grid grid-cols-1 gap-4 md:grid-cols-2">
      <NoiseBackground containerClassName="h-48">
        <div className="flex h-full items-center justify-center text-lg font-semibold">
          Token defaults
        </div>
      </NoiseBackground>
      <NoiseBackground
        containerClassName="h-48"
        gradientColors={["var(--destructive)", "var(--purple)", "var(--info)"]}
      >
        <div className="flex h-full items-center justify-center text-lg font-semibold">
          Custom palette
        </div>
      </NoiseBackground>
    </div>
  )
}
