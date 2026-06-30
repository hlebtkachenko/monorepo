import * as React from "react"

import { cn } from "@workspace/ui/lib/utils"

export interface RecordWorkspaceProps {
  /**
   * Body of the active section (the dense form zone). The caller owns which
   * section is active (via the content-header tabs) and passes its content here
   * — this block just lays it out. The record's title / status / actions live in
   * the `ContentHeader`, not in this block.
   */
  children: React.ReactNode
  /**
   * Optional company / VAT / totals recap rail beside the form (right column).
   * Omit to render the form full-width.
   */
  aside?: React.ReactNode
  /**
   * Optional full-width line-items region (a grid + its toolbar), rendered
   * edge-to-edge below the form band. Omit for record types with no lines —
   * that is how the same workspace serves a document, a counterparty, or a
   * settings record.
   */
  lineItems?: React.ReactNode
  /** Optional sticky footer (Save / Close), pinned to the bottom of the body. */
  footer?: React.ReactNode
  /** Width of the centered form/aside band. Default `"5xl"`. */
  maxWidth?: "3xl" | "4xl" | "5xl" | "full"
  className?: string
}

const MAX_W: Record<NonNullable<RecordWorkspaceProps["maxWidth"]>, string> = {
  "3xl": "max-w-3xl",
  "4xl": "max-w-4xl",
  "5xl": "max-w-5xl",
  full: "max-w-none",
}

/**
 * Record workspace (Single archetype) — one record on show as a sectioned,
 * editable surface. A scrolling band holds the active section's form (centered,
 * with an optional recap rail), an optional full-width line-items grid, and an
 * optional sticky footer. Generic + document-first: the section tabs live in the
 * `ContentHeader`; the `lineItems` / `aside` / `footer` slots are shown only when
 * a record needs them. Mount in a `ContentPanel` with
 * `bodyClassName="flex min-h-0 flex-col p-0"` so it owns its own scroll + footer.
 */
export function RecordWorkspace({
  children,
  aside,
  lineItems,
  footer,
  maxWidth = "5xl",
  className,
}: RecordWorkspaceProps) {
  return (
    <div
      data-slot="record-workspace"
      className={cn("flex min-h-0 flex-1 flex-col", className)}
    >
      <div className="min-h-0 flex-1 overflow-auto">
        <div
          className={cn(
            "mx-auto flex w-full flex-col gap-6 p-4",
            MAX_W[maxWidth],
          )}
        >
          <div
            className={cn(
              "grid gap-6",
              aside != null && "lg:grid-cols-[minmax(0,1fr)_20rem]",
            )}
          >
            <div className="min-w-0">{children}</div>
            {aside != null ? <aside className="min-w-0">{aside}</aside> : null}
          </div>
        </div>

        {lineItems != null ? (
          <div
            data-slot="record-workspace-lines"
            className="border-t border-border-subtle"
          >
            {lineItems}
          </div>
        ) : null}
      </div>

      {footer != null ? (
        <div
          data-slot="record-workspace-footer"
          className="flex shrink-0 items-center justify-end gap-2 border-t border-border-subtle bg-shell-surface px-4 py-2"
        >
          {footer}
        </div>
      ) : null}
    </div>
  )
}
