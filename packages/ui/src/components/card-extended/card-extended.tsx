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

const wrapperVariants = cva("relative", {
  variants: {
    variant: {
      shadow: "",
      lines: "",
      hatched: "overflow-hidden rounded-xl",
      aurora: "overflow-hidden rounded-xl bg-background",
      tilted: "",
      stacked: "h-full pt-6",
    },
  },
  defaultVariants: { variant: "shadow" },
})

const cardVariants = cva("", {
  variants: {
    variant: {
      shadow: "shadow-[5px_5px_0px_0px_var(--border)]",
      lines: "w-full border-none p-10 shadow-none",
      hatched: "isolate z-10 border-2 border-border bg-transparent",
      aurora: "isolate z-10 border-border bg-transparent",
      tilted: "isolate z-10",
      stacked: "isolate z-10 shadow-[0_-3px_6px_-2px_var(--border)]",
    },
  },
  defaultVariants: { variant: "shadow" },
})

interface CardExtendedProps
  extends React.ComponentProps<typeof Card>, VariantProps<typeof cardVariants> {
  variant?: CardExtendedVariant
}

function CardExtended({
  variant = "shadow",
  className,
  children,
  ...props
}: CardExtendedProps) {
  if (variant === "shadow") {
    return (
      <Card
        data-slot="card-extended"
        data-variant={variant}
        className={cn(cardVariants({ variant }), className)}
        {...props}
      >
        {children}
      </Card>
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
        <Line className="top-2 left-0 bg-linear-to-l sm:top-4 md:top-6" />
        <Line className="bottom-2 left-0 bg-linear-to-r sm:bottom-4 md:bottom-6" />
        <div className="absolute inset-y-0 left-2 z-0 w-px bg-linear-to-t from-transparent via-border to-border sm:left-4 md:left-6" />
        <div className="absolute inset-y-0 right-2 z-0 w-px bg-linear-to-t from-transparent via-border to-border sm:right-4 md:right-6" />
      </>
    )
  }

  if (variant === "hatched") {
    return (
      <div
        aria-hidden
        className="absolute inset-1 z-0 rounded-lg opacity-50"
        style={{
          backgroundImage:
            "repeating-linear-gradient(45deg, transparent, transparent 2px, var(--border) 2px, var(--border) 4px)",
        }}
      />
    )
  }

  if (variant === "aurora") {
    return (
      <div
        aria-hidden
        className="absolute inset-0 rounded-lg"
        style={{
          backgroundImage: `
            radial-gradient(ellipse at 20% 30%, color-mix(in oklab, var(--chart-1) 30%, transparent) 0%, transparent 60%),
            radial-gradient(ellipse at 80% 70%, color-mix(in oklab, var(--chart-2) 20%, transparent) 0%, transparent 70%),
            radial-gradient(ellipse at 60% 20%, color-mix(in oklab, var(--chart-3) 20%, transparent) 0%, transparent 50%),
            radial-gradient(ellipse at 40% 80%, color-mix(in oklab, var(--chart-4) 20%, transparent) 0%, transparent 65%)
          `,
        }}
      />
    )
  }

  if (variant === "tilted") {
    return (
      <div
        aria-hidden
        className="absolute inset-0 isolate z-0 scale-x-95 -rotate-[5deg] rounded-xl border border-border/50 bg-muted/30 py-10"
      />
    )
  }

  if (variant === "stacked") {
    return (
      <>
        <div
          aria-hidden
          className="absolute top-0 h-full w-full scale-95 rounded-xl border border-border bg-card"
        />
        <div
          aria-hidden
          className="absolute top-3 h-full w-full scale-[0.97] rounded-xl border border-border bg-card shadow-[0_-2px_6px_-2px_var(--border)]"
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
