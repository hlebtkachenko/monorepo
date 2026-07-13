import * as React from "react"

import { Badge } from "@workspace/ui/components/badge"
import { Card } from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"
import { Minus, TrendingDown, TrendingUp } from "@workspace/ui/lib/icons"

export type StatCardTrend = "up" | "down" | "flat"

type StatCardProps = React.ComponentProps<typeof Card>

function StatCard({ className, ...props }: StatCardProps) {
  return (
    <Card
      data-slot="stat-card"
      className={cn(
        "gap-2 rounded-md border border-border p-5 ring-0",
        className,
      )}
      {...props}
    />
  )
}

type StatCardLabelProps = React.ComponentProps<"p">

function StatCardLabel({ className, ...props }: StatCardLabelProps) {
  return (
    <p
      data-slot="stat-card-label"
      className={cn(
        "font-mono text-[10px] tracking-[0.12em] text-muted-foreground uppercase",
        className,
      )}
      {...props}
    />
  )
}

type StatCardValueProps = React.ComponentProps<"p">

function StatCardValue({ className, ...props }: StatCardValueProps) {
  return (
    <p
      data-slot="stat-card-value"
      className={cn(
        "text-3xl font-semibold tracking-[-0.035em] text-foreground",
        className,
      )}
      {...props}
    />
  )
}

type StatCardDeltaProps = Omit<
  React.ComponentProps<typeof Badge>,
  "children" | "variant"
> & {
  trend: StatCardTrend
  children?: React.ReactNode
}

function StatCardDelta({
  trend,
  className,
  children,
  ...props
}: StatCardDeltaProps) {
  const Icon =
    trend === "up" ? TrendingUp : trend === "down" ? TrendingDown : Minus
  const tone = trend === "flat" ? "text-muted-foreground" : "text-foreground"
  return (
    <Badge
      data-slot="stat-card-delta"
      data-trend={trend}
      variant="secondary"
      className={cn(
        "h-auto gap-1 rounded-sm bg-accent px-1.5 py-0.5 font-mono text-[11px] leading-none",
        tone,
        className,
      )}
      {...props}
    >
      <Icon data-icon="inline-start" aria-hidden />
      {children}
    </Badge>
  )
}

export { StatCard, StatCardLabel, StatCardValue, StatCardDelta }
