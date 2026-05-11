"use client"

import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@workspace/ui/lib/utils"

const colorSwatchVariants = cva(
  "box-border rounded-sm border border-border bg-clip-padding shadow-sm data-disabled:pointer-events-none data-disabled:opacity-50",
  {
    variants: {
      size: {
        default: "size-8",
        sm: "size-6",
        lg: "size-12",
      },
    },
    defaultVariants: {
      size: "default",
    },
  },
)

function isCssColor(value: string): boolean {
  try {
    return typeof CSS !== "undefined" && typeof CSS.supports === "function"
      ? CSS.supports("color", value)
      : true
  } catch {
    return false
  }
}

function hasAlpha(value: string): boolean {
  const v = value.trim().toLowerCase()
  if (v === "transparent") return true
  if (/^#(?:[0-9a-f]{4}|[0-9a-f]{8})$/i.test(v)) return true
  if (/\b(?:rgba|hsla)\s*\(/i.test(v)) return true
  if (
    /\b(?:rgb|hsl|lab|lch|oklab|oklch|color)\s*\([^)]*\/\s*[\d.]+%?\s*\)/i.test(
      v,
    )
  ) {
    return true
  }
  return false
}

interface ColorSwatchProps
  extends
    Omit<React.ComponentProps<"div">, "children">,
    VariantProps<typeof colorSwatchVariants> {
  color?: string
  asChild?: boolean
  disabled?: boolean
  withoutTransparency?: boolean
}

function ColorSwatch({
  color,
  size = "default",
  asChild = false,
  disabled = false,
  withoutTransparency = false,
  className,
  style,
  ...props
}: ColorSwatchProps) {
  const colorValue = color?.trim()

  const backgroundStyle = React.useMemo<React.CSSProperties>(() => {
    if (!colorValue) {
      return {
        background: `linear-gradient(to bottom right, transparent calc(50% - 1px), var(--destructive) calc(50% - 1px) calc(50% + 1px), transparent calc(50% + 1px)) no-repeat`,
      }
    }
    if (!isCssColor(colorValue)) {
      return { backgroundColor: "transparent" }
    }
    if (!withoutTransparency && hasAlpha(colorValue)) {
      return {
        background: `linear-gradient(${colorValue}, ${colorValue}), repeating-conic-gradient(var(--muted) 0% 25%, var(--background) 0% 50%) 0% 50% / 10px 10px`,
      }
    }
    return { backgroundColor: colorValue }
  }, [colorValue, withoutTransparency])

  const ariaLabel = !colorValue
    ? "No color selected"
    : `Color swatch: ${colorValue}`

  const Comp = asChild ? Slot.Root : "div"

  return (
    <Comp
      role="img"
      aria-label={ariaLabel}
      aria-disabled={disabled || undefined}
      data-disabled={disabled ? "" : undefined}
      data-slot="color-swatch"
      {...props}
      className={cn(colorSwatchVariants({ size }), className)}
      style={{
        ...backgroundStyle,
        forcedColorAdjust: "none",
        ...style,
      }}
    />
  )
}

export { ColorSwatch, colorSwatchVariants }
export type { ColorSwatchProps }
