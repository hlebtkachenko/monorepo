import * as React from "react"

export interface InspectorBodyContentProps {
  children?: React.ReactNode
}

/**
 * InspectorBodyContent — the scrollable region below `InspectorBodyHeader`,
 * filled by the active tab's content. A `flex-col` with a 32px `gap-8` so stacked
 * sections in a tab (e.g. Details' key-details group + Totals) are separated by a
 * consistent 32px rhythm; a single-section tab is unaffected (one child, no gap).
 */
export function InspectorBodyContent({ children }: InspectorBodyContentProps) {
  return (
    <div
      data-slot="inspector-body-content"
      className="flex min-h-0 flex-1 flex-col gap-8 overflow-auto bg-inspector-content p-4"
    >
      {children}
    </div>
  )
}
