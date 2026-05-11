import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"

import { Card } from "@workspace/ui/components/card"
import { cn } from "@workspace/ui/lib/utils"

type CardExtendedVariant =
  | "shadow"
  | "lines"
  | "hatched"
  | "aurora"
  | "tilted"
  | "stacked"

// All variants share the same outer footprint so a grid of variants reads
// as a consistent set of cards with different decoration.
const FRAME = "relative h-44 w-full"

const wrapperVariants = cva(FRAME, {
  variants: {
    variant: {
      shadow: "",
      lines: "px-4 py-3",
      hatched: "",
      aurora: "",
      tilted: "py-4",
      stacked: "pt-4",
    },
  },
  defaultVariants: { variant: "shadow" },
})

const cardVariants = cva("relative z-10 h-full", {
  variants: {
    variant: {
      shadow: "shadow-[5px_5px_0px_0px_var(--border)]",
      lines: "border-none shadow-none",
      // hatched + aurora paint their texture directly on the card body via
      // inline style.backgroundImage, so the card itself reads as a textured
      // surface rather than a plain card sitting on a frame.
      hatched: "border border-border",
      aurora: "border-border",
      tilted: "",
      stacked: "shadow-[0_-3px_6px_-2px_var(--border)]",
    },
  },
  defaultVariants: { variant: "shadow" },
})

const HATCHED_BG =
  "repeating-linear-gradient(45deg, transparent, transparent 3px, color-mix(in oklab, var(--foreground) 20%, transparent) 3px, color-mix(in oklab, var(--foreground) 20%, transparent) 5px)"

const AURORA_BG = `
  radial-gradient(ellipse at 20% 30%, color-mix(in oklab, var(--info) 45%, transparent) 0%, transparent 60%),
  radial-gradient(ellipse at 80% 70%, color-mix(in oklab, var(--success) 40%, transparent) 0%, transparent 70%),
  radial-gradient(ellipse at 60% 20%, color-mix(in oklab, var(--warning) 35%, transparent) 0%, transparent 55%),
  radial-gradient(ellipse at 40% 80%, color-mix(in oklab, var(--destructive) 30%, transparent) 0%, transparent 65%)
`

interface CardExtendedProps
  extends React.ComponentProps<typeof Card>, VariantProps<typeof cardVariants> {
  variant?: CardExtendedVariant
}

function CardExtended({
  variant = "shadow",
  className,
  style,
  children,
  ...props
}: CardExtendedProps) {
  const cardStyle: React.CSSProperties = { ...style }
  if (variant === "hatched") cardStyle.backgroundImage = HATCHED_BG
  if (variant === "aurora") cardStyle.backgroundImage = AURORA_BG

  if (variant === "shadow" || variant === "hatched" || variant === "aurora") {
    return (
      <div className={FRAME} data-slot="card-extended-wrapper">
        <Card
          data-slot="card-extended"
          data-variant={variant}
          className={cn(cardVariants({ variant }), className)}
          style={cardStyle}
          {...props}
        >
          {children}
        </Card>
      </div>
    )
  }

  return (
    <div
      data-slot="card-extended-wrapper"
      className={wrapperVariants({ variant })}
    >
      <CardDecoration variant={variant} />
      <Card
        data-slot="card-extended"
        data-variant={variant}
        className={cn(cardVariants({ variant }), className)}
        style={cardStyle}
        {...props}
      >
        {children}
      </Card>
    </div>
  )
}

function CardDecoration({ variant }: { variant: CardExtendedVariant }) {
  if (variant === "lines") {
    return (
      <>
        <Line className="top-1 left-0 bg-linear-to-l" />
        <Line className="bottom-1 left-0 bg-linear-to-r" />
        <div className="absolute inset-y-0 left-1 z-0 w-px bg-linear-to-t from-transparent via-border to-border" />
        <div className="absolute inset-y-0 right-1 z-0 w-px bg-linear-to-t from-transparent via-border to-border" />
      </>
    )
  }

  if (variant === "tilted") {
    return (
      <div
        aria-hidden
        className="absolute inset-0 z-0 scale-x-95 -rotate-[5deg] rounded-xl border border-border/50 bg-muted/30"
      />
    )
  }

  if (variant === "stacked") {
    return (
      <>
        <div
          aria-hidden
          className="absolute inset-x-0 top-0 h-full scale-95 rounded-xl border border-border bg-card"
        />
        <div
          aria-hidden
          className="absolute inset-x-0 top-2 h-full scale-[0.97] rounded-xl border border-border bg-card shadow-[0_-2px_6px_-2px_var(--border)]"
        />
      </>
    )
  }

  return null
}

function Line({ className }: { className?: string }) {
  return (
    <div
      aria-hidden
      className={cn(
        "absolute z-0 h-px w-full from-transparent from-1% via-border to-border",
        className,
      )}
    />
  )
}

export { CardExtended }
export type { CardExtendedProps, CardExtendedVariant }
