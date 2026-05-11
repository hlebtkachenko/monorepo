"use client"

import * as React from "react"
import { Separator as SeparatorPrimitive } from "radix-ui"
import { cva, type VariantProps } from "class-variance-authority"

import { cn } from "@workspace/ui/lib/utils"

const separatorExtendedVariants = cva(
  "shrink-0 border-border data-horizontal:w-full data-horizontal:border-t data-vertical:h-full data-vertical:border-e",
  {
    variants: {
      variant: {
        solid: "border-solid",
        dashed: "border-dashed",
        dotted: "border-dotted",
        double:
          "border-double p-px data-horizontal:border-y data-vertical:border-x",
      },
    },
    defaultVariants: { variant: "solid" },
  },
)

function SeparatorExtended({
  className,
  variant,
  orientation = "horizontal",
  decorative = true,
  ...props
}: React.ComponentProps<typeof SeparatorPrimitive.Root> &
  VariantProps<typeof separatorExtendedVariants>) {
  return (
    <SeparatorPrimitive.Root
      data-slot="separator-extended"
      data-variant={variant ?? "solid"}
      decorative={decorative}
      orientation={orientation}
      className={cn(separatorExtendedVariants({ variant }), className)}
      {...props}
    />
  )
}

export { SeparatorExtended, separatorExtendedVariants }
