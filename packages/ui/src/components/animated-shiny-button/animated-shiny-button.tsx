"use client"

import * as React from "react"
import { cn } from "@workspace/ui/lib/utils"

interface AnimatedShinyButtonProps extends React.ComponentProps<"button"> {
  highlightColor?: string
}

function AnimatedShinyButton({
  className,
  highlightColor = "var(--primary)",
  children,
  ...props
}: AnimatedShinyButtonProps) {
  return (
    <button
      data-slot="animated-shiny-button"
      className={cn(
        "group relative isolate inline-flex cursor-pointer items-center justify-center overflow-hidden rounded-lg px-6 py-3 text-sm font-medium outline-offset-4 transition-all duration-500 active:translate-y-px disabled:pointer-events-none disabled:opacity-50",
        "bg-primary text-primary-foreground",
        "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
        className,
      )}
      style={
        {
          "--shiny-highlight": highlightColor,
        } as React.CSSProperties
      }
      {...props}
    >
      {/* Animated conic gradient border */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 [animation:shiny-gradient-spin_3s_linear_infinite] rounded-[inherit] opacity-60 transition-opacity duration-500 group-hover:opacity-100"
        style={{
          background: `conic-gradient(from var(--shiny-gradient-angle), transparent, var(--shiny-highlight) 5%, transparent 15%)`,
          mask: "linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0)",
          maskComposite: "exclude",
          padding: "2px",
        }}
      />
      {/* Shimmer overlay */}
      <span
        aria-hidden
        className="pointer-events-none absolute inset-0 -z-10 [animation:shiny-shimmer_4.5s_linear_infinite] opacity-0 transition-opacity duration-500 [animation-play-state:paused] group-hover:opacity-40 group-hover:[animation-play-state:running]"
        style={{
          background: `linear-gradient(-50deg, transparent, var(--shiny-highlight), transparent)`,
          maskImage:
            "radial-gradient(circle at bottom, transparent 40%, black)",
        }}
      />
      <span className="relative z-10 flex items-center gap-2">{children}</span>
    </button>
  )
}

export { AnimatedShinyButton, type AnimatedShinyButtonProps }
