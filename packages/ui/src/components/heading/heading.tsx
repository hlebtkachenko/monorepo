import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@workspace/ui/lib/utils"

const headingVariants = cva(
  "scroll-m-20 font-heading tracking-tight first:mt-0",
  {
    variants: {
      level: {
        1: "mt-10 text-4xl font-bold lg:text-5xl",
        2: "mt-8 text-3xl font-semibold",
        3: "mt-6 text-2xl font-semibold",
        4: "mt-4 text-xl font-semibold",
      },
    },
    defaultVariants: {
      level: 1,
    },
  },
)

type HeadingLevel = 1 | 2 | 3 | 4

const headingElements = {
  1: "h1",
  2: "h2",
  3: "h3",
  4: "h4",
} as const

function Heading({
  level,
  asChild = false,
  className,
  ...props
}: React.ComponentProps<"h1"> &
  VariantProps<typeof headingVariants> & {
    level?: HeadingLevel
    asChild?: boolean
  }) {
  const resolvedLevel = level ?? 1
  const Comp = asChild ? Slot.Root : headingElements[resolvedLevel]

  return (
    <Comp
      data-slot="heading"
      data-level={resolvedLevel}
      className={cn(headingVariants({ level: resolvedLevel }), className)}
      {...props}
    />
  )
}

export { Heading, headingVariants }
export type { HeadingLevel }
