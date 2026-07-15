import * as React from "react"

export interface InspectorBodyContentProps {
  children?: React.ReactNode
}

/** InspectorBodyContent — the scrollable region below `InspectorBodyHeader`, filled by the active tab's content. */
export function InspectorBodyContent({ children }: InspectorBodyContentProps) {
  return (
    <div
      data-slot="inspector-body-content"
      className="min-h-0 flex-1 overflow-auto bg-inspector-content p-4"
    >
      {children}
    </div>
  )
}
