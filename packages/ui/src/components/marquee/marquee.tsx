import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

interface MarqueeProps extends React.ComponentPropsWithoutRef<"div"> {
  reverse?: boolean
  pauseOnHover?: boolean
  vertical?: boolean
  repeat?: number
  children: React.ReactNode
}

function Marquee({
  className,
  reverse = false,
  pauseOnHover = false,
  vertical = false,
  repeat = 4,
  children,
  ...props
}: MarqueeProps) {
  return (
    <div
      data-slot="marquee"
      data-orientation={vertical ? "vertical" : "horizontal"}
      {...props}
      className={cn(
        "group flex [gap:var(--gap,1rem)] overflow-hidden p-2 [--duration:40s]",
        vertical ? "flex-col" : "flex-row",
        className,
      )}
    >
      {Array.from({ length: repeat }).map((_, i) => (
        <div
          key={i}
          aria-hidden={i > 0}
          className={cn(
            "flex shrink-0 justify-around [gap:var(--gap,1rem)]",
            vertical
              ? "animate-marquee-vertical flex-col"
              : "animate-marquee flex-row",
            pauseOnHover && "group-hover:[animation-play-state:paused]",
            reverse && "[animation-direction:reverse]",
          )}
        >
          {children}
        </div>
      ))}
    </div>
  )
}

export { Marquee }
export type { MarqueeProps }
