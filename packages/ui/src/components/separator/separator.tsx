"use client"

import * as React from "react"
import { Separator as SeparatorPrimitive } from "radix-ui"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@workspace/ui/lib/utils"

const separatorVariants = cva("shrink-0 border-border", {
  variants: {
    variant: {
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

function Separator({
  className,
  variant,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root> &
  VariantProps<typeof separatorVariants>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator"
      data-variant={variant ?? "default"}
      decorative={decorative}
      orientation={orientation}
      className={cn(separatorVariants({ variant }), className)}
      {...props}
    />
  )
}

export { Separator, separatorVariants }
