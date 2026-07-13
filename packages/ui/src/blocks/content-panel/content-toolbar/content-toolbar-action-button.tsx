"use client"

import { Button } from "@workspace/ui/components/button"
import {
  Tooltip,
  TooltipContent,
  TooltipProvider,
  TooltipTrigger,
} from "@workspace/ui/components/tooltip"
import { useIcons } from "@workspace/ui/icon-packs"

import type { ActionDescriptor } from "./toolbar-descriptors"

/**
 * A single page-purpose action (toolbar right #2, rendered once per entry in
 * `actions[]`). A DATA-driven Button — its icon resolves by NAME through
 * `useIcons()`, never a raw node — with an optional Tooltip wrapper.
 */
export function ContentToolbarActionButton({
  label,
  icon,
  variant = "outline",
  disabled,
  tooltip,
  onSelect,
}: ActionDescriptor) {
  const icons = useIcons()
  const Icon = icon ? icons[icon] : null

  const button = (
    <Button variant={variant} size="sm" disabled={disabled} onClick={onSelect}>
      {Icon ? <Icon /> : null}
      {label}
    </Button>
  )

  if (!tooltip) return button

  return (
    <TooltipProvider>
      <Tooltip>
        <TooltipTrigger asChild>{button}</TooltipTrigger>
        <TooltipContent side="bottom">{tooltip}</TooltipContent>
      </Tooltip>
    </TooltipProvider>
  )
}
