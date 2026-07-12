"use client"

import * as React from "react"

/**
 * Shared content-header view state. The favorite/config actions and the
 * configure (⋯) menu are now rendered INTERNALLY by `ContentHeader` (a closed
 * chrome cluster + a data-driven configure menu); pages only own the view
 * show/hide state, exposed through `useTabVisibility`.
 */

export interface ManageTab {
  value: string
  label: string
}

/**
 * Controlled view show/hide state for the content-header configure (⋯) menu.
 * Pass the full view list + the current active value; get back a `visible`
 * list (feed to `ContentHeader.viewTabs`) and an `activeValue` clamped to it —
 * so hiding the active view cleanly falls back to the first visible one,
 * derived in render (no effect, no one-frame mismatch between header and body).
 * Feed `{ tabs, hidden, onToggle: toggle }` to `ContentHeader.manageViews`.
 */
export function useTabVisibility(tabs: ManageTab[], active?: string) {
  const [hidden, setHidden] = React.useState<ReadonlySet<string>>(
    () => new Set(),
  )
  const toggle = React.useCallback((value: string) => {
    setHidden((prev) => {
      const next = new Set(prev)
      if (next.has(value)) next.delete(value)
      else next.add(value)
      return next
    })
  }, [])
  const visible = tabs.filter((t) => !hidden.has(t.value))
  const activeValue =
    active != null && visible.some((t) => t.value === active)
      ? active
      : visible[0]?.value
  return { hidden, toggle, visible, activeValue }
}
