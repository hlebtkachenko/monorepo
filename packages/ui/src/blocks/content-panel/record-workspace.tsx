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
   * Optional right-hand section beside the form (recap card, document preview,
   * company panel, …). This is an in-flow COLUMN of the page — not a docked
   * sidebar — so it scrolls with the form and stacks under it on a narrow panel.
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
  /**
   * Optional sticky footer (Save / Close), pinned to the bottom of the body.
   *
   * @deprecated Selection and save actions should move to the `ContentFooter`
   * block (the Content Panel's `footer` slot) so the sticky bottom action
   * surface lives in one place. Prefer `ContentFooter` with its `selection` /
   * `save` data props over passing bespoke footer nodes here, to dedupe the two
   * footer surfaces.
   */
  footer?: React.ReactNode
  /** Width of the centered form/aside band. Default `"5xl"`. */
  maxWidth?: "3xl" | "4xl" | "5xl" | "full"
  /**
   * How the form band lays out `children`:
   *   - `"stack"` (default) → the classic centered form + optional `aside`
   *     column, capped at `maxWidth`. This is the original behavior.
   *   - `"panels"` → a full-width, container-query grid of side-by-side panels
   *     (1 → 2 → 3 columns as the panel widens). `aside` is ignored and the
   *     `maxWidth` band is dropped, so `children` (the panels) fill the width.
   * The `lineItems` / `footer` slots behave identically in both modes.
   */
  formLayout?: "stack" | "panels"
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
  formLayout = "stack",
  className,
}: RecordWorkspaceProps) {
  const isPanels = formLayout === "panels"
  return (
    <div
      data-slot="record-workspace"
      className={cn("flex min-h-0 flex-1 flex-col", className)}
    >
      {/* Form band — scrolls on its own and stays the dominant region. In
          "stack" it keeps the original proportion (form flex-[3], line-items
          flex-[2]); in "panels" it's flex-1 above a content-sized grid. */}
      <div
        className={cn(
          "min-h-0 overflow-auto",
          isPanels ? "flex-1" : lineItems != null ? "flex-[3]" : "flex-1",
        )}
      >
        {isPanels ? (
          // Panels mode — a full-width container-query grid of side-by-side
          // record panels. No centered band, no aside: the panels ARE the
          // layout and fill the width, folding 3 → 2 → 1 column as it narrows.
          <div className="@container w-full p-4">
            <div className="grid grid-cols-1 items-start gap-4 @2xl:grid-cols-2 @5xl:grid-cols-3">
              {children}
            </div>
          </div>
        ) : (
          <div
            className={cn(
              "@container mx-auto flex w-full flex-col gap-6 p-4",
              MAX_W[maxWidth],
            )}
          >
            <div
              className={cn(
                "grid gap-6",
                // Side-by-side only when there's genuinely room. A CONTAINER
                // query (not viewport) so that with the inspector docked — which
                // narrows the panel — the recap rail stacks under the form
                // instead of crushing the field grid.
                aside != null && "@3xl:grid-cols-[minmax(0,1fr)_18rem]",
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
        )}
      </div>

      {lineItems != null ? (
        <div
          data-slot="record-workspace-lines"
          className={cn(
            "flex flex-col border-t border-border-subtle",
            isPanels ? "shrink-0" : "min-h-[14rem] flex-[2]",
          )}
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
