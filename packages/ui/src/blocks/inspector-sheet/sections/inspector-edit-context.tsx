"use client"

import * as React from "react"

/**
 * Body-wide edit mode for Inspector sections. `InspectorBody` provides the
 * current value (driven by the header's "Edit" toggle); section content passed
 * as the page's `content` node mounts inside this provider, so any field can
 * read the mode without the page threading it down by hand.
 */
const InspectorEditContext = React.createContext(false)

export function InspectorEditProvider({
  editing,
  children,
}: {
  editing: boolean
  children: React.ReactNode
}) {
  return (
    <InspectorEditContext.Provider value={editing}>
      {children}
    </InspectorEditContext.Provider>
  )
}

/** Whether the Inspector body is currently in edit mode. */
export function useInspectorEditing(): boolean {
  return React.useContext(InspectorEditContext)
}

/**
 * Per-field editability policy:
 *   - `"always"` — always an input (e.g. a comment composer, a search box)
 *   - `"onEdit"` — read-only until the header's Edit toggle is on (default)
 *   - `"never"` — always read-only (derived/computed values, ids)
 */
export type InspectorFieldEditPolicy = "always" | "onEdit" | "never"

/** Resolve whether a field with the given policy is editable right now. */
export function useInspectorFieldEditable(
  policy: InspectorFieldEditPolicy = "onEdit",
): boolean {
  const editing = useInspectorEditing()
  if (policy === "always") return true
  if (policy === "never") return false
  return editing
}
