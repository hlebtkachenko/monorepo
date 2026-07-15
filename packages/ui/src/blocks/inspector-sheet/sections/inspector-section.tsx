"use client"

import * as React from "react"

import { useIcons, type IconName } from "@workspace/ui/icon-packs"
import { cn } from "@workspace/ui/lib/utils"

export interface InspectorSectionProps {
  /** Section heading — rendered ABOVE the content, outside any box, a little
   * bigger than body text. */
  title?: string
  /** Muted sub-heading under the title. */
  description?: string
  /** Leading glyph next to the title. */
  icon?: IconName
  /** Right-aligned header slot (e.g. an "Add" button). */
  action?: React.ReactNode
  className?: string
  /** Extra classes on the content wrapper. */
  contentClassName?: string
  children: React.ReactNode
}

/**
 * InspectorSection — the shared frame for an Inspector body section: a heading
 * that sits ABOVE the content, outside any box (per the reference), slightly
 * larger than body text, with an optional description / leading icon /
 * right-aligned action. The content sits directly on the body — each section
 * draws its own inner framing (a list card, a table border, nothing at all).
 * No hardcoded copy or colors — everything is props + tokens.
 */
export function InspectorSection({
  title,
  description,
  icon,
  action,
  className,
  contentClassName,
  children,
}: InspectorSectionProps) {
  const icons = useIcons()
  const Icon = icon ? icons[icon] : null
  const hasHeader = title != null || description != null || action != null

  return (
    <section
      data-slot="inspector-section"
      className={cn("flex flex-col gap-3.5", className)}
    >
      {hasHeader ? (
        <div className="flex items-center gap-2">
          {Icon ? (
            <Icon
              aria-hidden
              className="size-4 shrink-0 text-muted-foreground"
            />
          ) : null}
          <div className="min-w-0 flex-1">
            {title ? (
              <h3 className="truncate text-[0.9375rem] leading-tight font-semibold">
                {title}
              </h3>
            ) : null}
            {description ? (
              <p className="truncate text-xs text-muted-foreground">
                {description}
              </p>
            ) : null}
          </div>
          {action ? <div className="shrink-0">{action}</div> : null}
        </div>
      ) : null}
      <div className={cn(contentClassName)}>{children}</div>
    </section>
  )
}
