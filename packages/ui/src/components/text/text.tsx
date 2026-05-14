import * as React from "react"
import { cva, type VariantProps } from "class-variance-authority"
import { Slot } from "radix-ui"

import { cn } from "@workspace/ui/lib/utils"

const textVariants = cva("", {
  variants: {
    variant: {
      default: "leading-7 [&:not(:first-child)]:mt-6",
      lead: "text-xl text-muted-foreground",
      large: "text-lg font-semibold",
      small: "text-sm leading-none font-medium",
      muted: "text-sm text-muted-foreground",
      subtle: "text-sm text-foreground/60",
      caption: "text-xs text-muted-foreground",
      overline:
        "text-xs font-medium tracking-wider text-muted-foreground uppercase",
      blockquote: "mt-6 border-l-2 pl-6 text-lg italic",
      "inline-code":
        "relative rounded bg-muted px-[0.3rem] py-[0.2rem] font-mono text-sm font-semibold",
    },
  },
  defaultVariants: {
    variant: "default",
  },
})

type TextVariant = NonNullable<VariantProps<typeof textVariants>["variant"]>

const variantElements: Record<
  TextVariant,
  "p" | "blockquote" | "code" | "span" | "figcaption"
> = {
  default: "p",
  lead: "p",
  large: "p",
  small: "p",
  muted: "p",
  subtle: "p",
  caption: "figcaption",
  overline: "span",
  blockquote: "blockquote",
  "inline-code": "code",
}

function Text({
  variant,
  asChild = false,
  className,
  ...props
}: React.HTMLAttributes<HTMLElement> &
  VariantProps<typeof textVariants> & {
    asChild?: boolean
  }) {
  const resolvedVariant = variant ?? "default"
  const Comp = asChild ? Slot.Root : variantElements[resolvedVariant]

  return (
    <Comp
      data-slot="text"
      data-variant={resolvedVariant}
      className={cn(textVariants({ variant: resolvedVariant }), className)}
      {...props}
    />
  )
}

export { Text, textVariants }
