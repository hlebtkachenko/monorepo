"use client"

import {
  HoverCard,
  HoverCardContent,
  HoverCardTrigger,
} from "@workspace/ui/components/hover-card"

export function HoverCardDemo() {
  return (
    <HoverCard>
      <HoverCardTrigger asChild>
        <span className="cursor-pointer font-medium underline underline-offset-4">
          @hlebtkachenko
        </span>
      </HoverCardTrigger>
      <HoverCardContent>
        <div className="flex gap-3">
          <div className="flex size-10 shrink-0 items-center justify-center rounded-full bg-muted font-medium text-sm">
            HT
          </div>
          <div className="flex flex-col gap-0.5">
            <p className="text-sm font-medium">Hleb Tkachenko</p>
            <p className="text-xs text-muted-foreground">@hlebtkachenko</p>
            <p className="mt-1 text-xs text-muted-foreground">
              Building Agentic Finance — construction finance SaaS. Prague.
            </p>
          </div>
        </div>
      </HoverCardContent>
    </HoverCard>
  )
}
