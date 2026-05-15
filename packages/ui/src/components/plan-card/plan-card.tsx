"use client"

import * as React from "react"
import { Check } from "lucide-react"
import { RadioGroup as RadioGroupPrimitive } from "radix-ui"

import { cn } from "@workspace/ui/lib/utils"
import { Badge } from "@workspace/ui/components/badge"

export interface PlanCardPrice {
  amount: string
  period: string
}

export interface PlanCardProps extends Omit<
  React.ComponentProps<typeof RadioGroupPrimitive.Item>,
  "children" | "asChild"
> {
  name: string
  description?: string
  features?: string[]
  price: PlanCardPrice
  badge?: string
}

function PlanCard({
  className,
  value,
  name,
  description,
  features = [],
  price,
  badge,
  disabled,
  ...props
}: PlanCardProps) {
  const id = React.useId()

  return (
    <label
      htmlFor={id}
      data-slot="plan-card"
      className={cn(
        "group flex cursor-pointer flex-col gap-3 rounded-lg border p-4 transition-colors sm:flex-row sm:items-start sm:gap-4",
        "border-border bg-background",
        "hover:bg-muted",
        "has-[[data-state=checked]]:border-primary has-[[data-state=checked]]:bg-primary/5",
        "has-[:focus-visible]:ring-3 has-[:focus-visible]:ring-ring/50 has-[:focus-visible]:outline-none",
        disabled && "pointer-events-none opacity-50",
        className,
      )}
    >
      <RadioGroupPrimitive.Item
        id={id}
        value={value}
        disabled={disabled}
        className={cn(
          "relative mt-0.5 flex aspect-square size-4 shrink-0 rounded-full border border-input outline-none",
          "focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50",
          "disabled:cursor-not-allowed disabled:opacity-50",
          "dark:bg-input/30",
          "data-[state=checked]:border-primary data-[state=checked]:bg-primary data-[state=checked]:text-primary-foreground",
        )}
        {...props}
      >
        <RadioGroupPrimitive.Indicator className="flex size-4 items-center justify-center">
          <span className="absolute top-1/2 left-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-primary-foreground" />
        </RadioGroupPrimitive.Indicator>
      </RadioGroupPrimitive.Item>

      <div className="flex flex-1 flex-col gap-2">
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-sm leading-snug font-semibold">{name}</span>
          {badge && <Badge variant="secondary">{badge}</Badge>}
        </div>
        {description && (
          <p className="text-xs text-muted-foreground">{description}</p>
        )}
        {features.length > 0 && (
          <ul className="flex flex-col gap-1">
            {features.map((feature) => (
              <li
                key={feature}
                className="flex items-center gap-1.5 text-xs text-muted-foreground"
              >
                <Check className="size-3.5 shrink-0 text-primary" />
                {feature}
              </li>
            ))}
          </ul>
        )}
      </div>

      <div className="flex shrink-0 flex-col items-end sm:items-end">
        <span className="text-base leading-none font-semibold">
          {price.amount}
        </span>
        <span className="text-xs text-muted-foreground">{price.period}</span>
      </div>
    </label>
  )
}

export { PlanCard }
