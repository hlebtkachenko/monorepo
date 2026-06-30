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
   * settings record. The region is given a real, bounded height so the grid
   * scrolls inside it instead of pushing the whole page.
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
 * editable surface. The body is a vertical stack: a SCROLLING form band
 * (centered, with an optional recap rail), then an optional full-width
 * line-items region that owns a bounded height so its grid scrolls inside
 * itself, then an optional sticky footer. Generic + document-first: the section
 * tabs live in the `ContentHeader`; the `lineItems` / `aside` / `footer` slots
 * are shown only when a record needs them. Mount in a `ContentPanel` with
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
      {/* Form band — scrolls on its own and stays the dominant region. When
          line-items are present the grid below keeps a guaranteed readable
          band (a min height) while the form takes the rest; without lines the
          form takes the whole body. */}
      <div
        className={cn(
          "min-h-0 overflow-auto",
          lineItems != null ? "flex-[3]" : "flex-1",
        )}
      >
        <div
          className={cn(
            "mx-auto flex w-full flex-col gap-6 p-4",
            MAX_W[maxWidth],
          )}
        >
          <div
            className={cn(
              "grid gap-6",
              // Side-by-side only when there's genuinely room — with the
              // inspector docked the body is narrower, so the recap rail stacks
              // under the form below `xl` instead of crushing the field grid.
              aside != null && "xl:grid-cols-[minmax(0,1fr)_18rem]",
            )}
          >
            <div className="min-w-0">{children}</div>
            {aside != null ? (
              <aside aria-label="Record summary" className="min-w-0">
                {aside}
              </aside>
            ) : null}
          </div>
        </div>
      </div>

      {lineItems != null ? (
        <div
          data-slot="record-workspace-lines"
          className="flex min-h-[14rem] flex-[2] flex-col border-t border-border-subtle"
        >
          {lineItems}
        </div>
      ) : null}

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
