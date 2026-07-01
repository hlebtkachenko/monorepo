"use client"

import * as React from "react"
import { Separator as SeparatorPrimitive } from "radix-ui"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@workspace/ui/lib/utils"

const separatorVariants = cva("shrink-0 border-border", {
  variants: {
    variant: {
      // Vertical default fills the cross axis (`self-stretch`) when no height is
      // set. For a SHORT, centred divider with a fixed height, pass `inset` —
      // align-self stretch can't size a fixed item, it would top-align it.
      default:
        "bg-border data-horizontal:h-px data-horizontal:w-full data-vertical:w-px data-vertical:self-stretch",
      dashed:
        "border-dashed data-horizontal:w-full data-horizontal:border-t data-vertical:h-full data-vertical:border-e",
      dotted:
        "border-dotted data-horizontal:w-full data-horizontal:border-t data-vertical:h-full data-vertical:border-e",
      double:
        "border-double p-px data-horizontal:w-full data-horizontal:border-y data-vertical:h-full data-vertical:border-x",
    },
  },
  defaultVariants: { variant: "default" },
})

interface SeparatorProps
  extends
    React.ComponentProps<typeof SeparatorPrimitive.Root>,
    VariantProps<typeof separatorVariants> {
  /**
   * Inset divider: a fixed-height vertical separator that stays centred in its
   * row instead of stretching edge to edge. Pair with a height (e.g. `h-6`);
   * centres the divider so it doesn't top-align. No effect when horizontal.
   */
  inset?: boolean
}

function Separator({
  className,
  variant,
  orientation = "horizontal",
  inset = false,
  decorative = true,
  ...props
}: SeparatorProps) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      data-variant={variant ?? "default"}
      decorative={decorative}
      orientation={orientation}
      className={cn(
        separatorVariants({ variant }),
        inset && "data-vertical:self-center",
        className,
      )}
      {...props}
    />
  )
}

export { Separator, separatorVariants }
