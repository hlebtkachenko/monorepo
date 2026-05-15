"use client"

import * as React from "react"
import { Check } from "lucide-react"
import { RadioGroup as RadioGroupPrimitive } from "radix-ui"

import { cn } from "@workspace/ui/lib/utils"

export interface ChoiceCardProps extends Omit<
  React.ComponentProps<typeof RadioGroupPrimitive.Item>,
  "children" | "asChild"
> {
  title: string
  description?: string
  icon?: React.ReactNode
}

function ChoiceCard({
  className,
  value,
  title,
  description,
  icon,
  disabled,
  ...props
}: ChoiceCardProps) {
  const id = React.useId()

  return (
    <label
      htmlFor={id}
      data-slot="choice-card"
      className={cn(
        "group relative flex cursor-pointer flex-col gap-3 rounded-lg border p-4 transition-colors",
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
        className="sr-only"
        {...props}
      />
      <div className="flex items-start justify-between gap-2">
        <div
          className={cn(
            "flex size-10 shrink-0 items-center justify-center rounded-md transition-colors [&_svg]:size-5",
            "bg-muted text-muted-foreground",
            "group-has-[[data-state=checked]]:bg-primary group-has-[[data-state=checked]]:text-primary-foreground",
          )}
          data-slot="choice-card-icon"
        >
          {icon}
        </div>
        <span
          className={cn(
            "mt-0.5 flex size-5 shrink-0 items-center justify-center rounded-full transition-colors",
            "text-transparent",
            "group-has-[[data-state=checked]]:text-primary",
          )}
          aria-hidden
        >
          <Check className="size-4" />
        </span>
      </div>
      <div className="flex flex-col gap-1">
        <span className="text-sm leading-snug font-medium">{title}</span>
        {description && (
          <span className="text-xs text-muted-foreground">{description}</span>
        )}
      </div>
    </label>
  )
}

interface ChoiceCardGridProps {
  columns?: 1 | 2
  className?: string
  children?: React.ReactNode
}

function ChoiceCardGrid({
  columns = 2,
  className,
  children,
}: ChoiceCardGridProps) {
  return (
    <div
      data-slot="choice-card-grid"
      className={cn(
        "grid gap-3 sm:gap-4",
        columns === 2 ? "grid-cols-1 sm:grid-cols-2" : "grid-cols-1",
        className,
      )}
    >
      {children}
    </div>
  )
}

export { ChoiceCard, ChoiceCardGrid }
export type { ChoiceCardGridProps }
