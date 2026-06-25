"use client"

import * as React from "react"

export interface ResizeHandlers {
  onPointerDown: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerMove: (e: React.PointerEvent<HTMLDivElement>) => void
  onPointerUp: (e: React.PointerEvent<HTMLDivElement>) => void
}

export interface UseResizeHandleOptions {
  /** Current width of the panel being resized (px). */
  width: number
  setWidth: (next: number) => void
  min: number
  max: number
  /**
   * Invert the drag delta — for a handle on the panel's LEFT edge, where
   * dragging left should GROW the panel (the assistant case).
   */
  invert?: boolean
}

/**
 * Pointer-Events drag for a panel resize handle. One source of truth for the
 * sidebar and the assistant handles (they differ only by min/max and the
 * delta sign). Uses `setPointerCapture` so mouse, touch, and pen all follow
 * the pointer outside the element bounds — no window listeners.
 *
 * Owns its own per-drag state and the global body-chrome cleanup: the pointer-
 * up handler unconditionally restores `cursor` / `user-select` (gating on the
 * drag ref could strand `user-select: none` on <body> and freeze selection),
 * and the unmount effect restores them if the component dies mid-drag.
 */
export function useResizeHandle({
  width,
  setWidth,
  min,
  max,
  invert = false,
}: UseResizeHandleOptions): ResizeHandlers {
  const drag = React.useRef<{ startX: number; startWidth: number } | null>(null)

  React.useEffect(() => {
    return () => {
      if (drag.current) {
        document.body.style.cursor = ""
        document.body.style.userSelect = ""
        drag.current = null
      }
    }
  }, [])

  const onPointerDown = (e: React.PointerEvent<HTMLDivElement>) => {
    // Only respond to primary button (mouse) / first contact (touch).
    if (e.button !== undefined && e.button !== 0) return
    e.preventDefault()
    e.currentTarget.setPointerCapture(e.pointerId)
    drag.current = { startX: e.clientX, startWidth: width }
    document.body.style.cursor = "col-resize"
    document.body.style.userSelect = "none"
  }

  const onPointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!drag.current) return
    const raw = e.clientX - drag.current.startX
    const delta = invert ? -raw : raw
    setWidth(Math.max(min, Math.min(max, drag.current.startWidth + delta)))
  }

  const onPointerUp = (e: React.PointerEvent<HTMLDivElement>) => {
    if (e.currentTarget.hasPointerCapture(e.pointerId)) {
      e.currentTarget.releasePointerCapture(e.pointerId)
    }
    drag.current = null
    document.body.style.cursor = ""
    document.body.style.userSelect = ""
  }

  return { onPointerDown, onPointerMove, onPointerUp }
}
