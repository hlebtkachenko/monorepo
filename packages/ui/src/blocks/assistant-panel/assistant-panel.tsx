import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

export interface AssistantPanelProps {
  /**
   * Optional custom body. When omitted, renders the scaffold placeholder
   * (centered, muted "coming soon" copy). Kept as a real node slot because this
   * is the assistant SURFACE, not a page-composed toolbar/header slot — the
   * descriptor-only rule governs Content* slots, not the panel body itself.
   */
  children?: React.ReactNode
  /** Placeholder label used when `children` is omitted. Default "Assistant". */
  label?: string
  className?: string
}

/**
 * AssistantPanel — the Sidekick AI panel body. A scaffold for now: it fills the
 * shell's assistant aside with centered, muted placeholder copy until the real
 * assistant surface is built. Gives the assistant slot a named home (replaces
 * three copies of an ad-hoc inline node across the org/workspace/admin shells).
 */
export function AssistantPanel({
  children,
  label = "Assistant",
  className,
}: AssistantPanelProps) {
  return (
    <div
      data-slot="assistant-panel"
      className={cn(
        "flex h-full items-center justify-center p-6 text-center text-sm text-muted-foreground",
        className,
      )}
    >
      {children ?? `${label} — coming soon`}
    </div>
  )
}
