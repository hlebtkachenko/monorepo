"use client"

import * as React from "react"

import type { ScrollEdges } from "./data-grid-view-pin"

/**
 * True when a keyboard event originates inside a control that owns its own key
 * handling — a text/number input, textarea, native/Radix select or combobox, or
 * a contenteditable element. The grid's arrow/Home/End/Page navigation must
 * defer to these so the caret / option list moves instead of the grid focus.
 */
function isTextEntryTarget(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  const tag = target.tagName
  if (tag === "INPUT" || tag === "TEXTAREA" || tag === "SELECT") return true
  if (target.isContentEditable) return true
  const role = target.getAttribute("role")
  return role === "textbox" || role === "combobox" || role === "listbox"
}

/**
 * Track whether the grid is scrolled away from each horizontal edge, so a pinned
 * column only casts its edge shadow when it actually overlaps scrolled content.
 * `updateEdges` is returned (not just `edges`) because it is ALSO bound directly
 * to the grid's `onScroll`; the hook itself re-runs it on scroll-affecting deps
 * (column footprint changes) and on container resize (ResizeObserver).
 */
export function useScrollEdges(
  gridRef: React.RefObject<HTMLDivElement | null>,
  deps: React.DependencyList,
): { edges: ScrollEdges; updateEdges: () => void } {
  const [edges, setEdges] = React.useState<ScrollEdges>({
    left: false,
    right: false,
  })
  const updateEdges = React.useCallback(() => {
    const el = gridRef.current
    if (!el) return
    setEdges({
      left: el.scrollLeft > 0,
      right: Math.ceil(el.scrollLeft + el.clientWidth) < el.scrollWidth,
    })
  }, [gridRef])
  React.useEffect(() => {
    updateEdges()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [updateEdges, ...deps])
  React.useEffect(() => {
    const el = gridRef.current
    if (!el) return
    const observer = new ResizeObserver(updateEdges)
    observer.observe(el)
    return () => observer.disconnect()
  }, [gridRef, updateEdges])
  return { edges, updateEdges }
}

/** Just the slice of the row virtualizer the focus grid needs — reveal a row
 *  that may be windowed out before focusing its cell. */
interface RowScroller {
  scrollToIndex: (
    index: number,
    options?: { align?: "auto" | "start" | "center" | "end" },
  ) => void
}

/**
 * The cell-focus interaction grid: a single focused {row, col} that arrow /
 * Home / End / PageUp / PageDown navigate, Tab-into auto-selects (keyboard only),
 * and a click-away clears. Focus is clamped on render (never in an effect) so a
 * hidden / reordered / filtered table can't point at a cell that no longer
 * exists. Extracted from DataGridView verbatim — it depends on no JSX, only the
 * grid element ref + the current row/col counts.
 */
export function useCellFocusGrid({
  gridRef,
  virtualize,
  rowVirtualizer,
  rowCount,
  colCount,
  firstFocusableCol,
}: {
  gridRef: React.RefObject<HTMLDivElement | null>
  virtualize: boolean
  rowVirtualizer: RowScroller
  rowCount: number
  colCount: number
  firstFocusableCol: number
}) {
  const [focused, setFocused] = React.useState<{
    row: number
    col: number
  } | null>(null)

  // Clamp the stored focus on render (rather than in an effect) so a hidden /
  // reordered / paginated table never points at a cell that no longer exists.
  const focusRow =
    focused && rowCount > 0 ? Math.min(focused.row, rowCount - 1) : null
  const focusCol =
    focused && colCount > 0
      ? Math.max(firstFocusableCol, Math.min(focused.col, colCount - 1))
      : null
  const hasFocus = focusRow !== null && focusCol !== null

  // Move browser focus to the focused cell and reveal it.
  React.useEffect(() => {
    if (focusRow === null || focusCol === null) return
    // When virtualized, the target row may not be mounted — scroll it into the
    // window first, then focus once it renders (rAF), else focus synchronously.
    if (virtualize) rowVirtualizer.scrollToIndex(focusRow, { align: "auto" })
    const focusCell = () => {
      const el = gridRef.current?.querySelector<HTMLElement>(
        `[data-slot="grid-cell"][data-row="${focusRow}"][data-col="${focusCol}"]`,
      )
      if (!el) return false
      if (el !== document.activeElement) el.focus()
      el.scrollIntoView({ block: "nearest", inline: "nearest" })
      return true
    }
    if (focusCell()) return
    const raf = requestAnimationFrame(() => focusCell())
    return () => cancelAnimationFrame(raf)
  }, [focusRow, focusCol, virtualize, rowVirtualizer, gridRef])

  const moveFocus = React.useCallback(
    (row: number, col: number) => {
      if (rowCount === 0 || colCount === 0) return
      setFocused({
        row: Math.max(0, Math.min(row, rowCount - 1)),
        col: Math.max(firstFocusableCol, Math.min(col, colCount - 1)),
      })
    },
    [rowCount, colCount, firstFocusableCol],
  )

  const onKeyDown = React.useCallback(
    (event: React.KeyboardEvent<HTMLDivElement>) => {
      if (rowCount === 0 || colCount === 0) return
      // Keys bubbling up from an active editor (text/number input, Select, or any
      // contenteditable) belong to that control — arrow/Home/End move its caret
      // or its option list, NOT the grid focus. Only drive navigation when the
      // event originates on the grid itself or a non-editor cell.
      if (isTextEntryTarget(event.target)) return
      const cur = { row: focusRow ?? 0, col: focusCol ?? 0 }
      const mod = event.ctrlKey || event.metaKey
      switch (event.key) {
        case "ArrowRight":
          moveFocus(cur.row, cur.col + 1)
          break
        case "ArrowLeft":
          moveFocus(cur.row, cur.col - 1)
          break
        case "ArrowDown":
          moveFocus(cur.row + 1, cur.col)
          break
        case "ArrowUp":
          moveFocus(cur.row - 1, cur.col)
          break
        case "Home":
          moveFocus(mod ? 0 : cur.row, firstFocusableCol)
          break
        case "End":
          moveFocus(mod ? rowCount - 1 : cur.row, colCount - 1)
          break
        case "PageDown":
          moveFocus(cur.row + 10, cur.col)
          break
        case "PageUp":
          moveFocus(cur.row - 10, cur.col)
          break
        default:
          return
      }
      event.preventDefault()
      event.stopPropagation()
    },
    [focusRow, focusCol, moveFocus, rowCount, colCount, firstFocusableCol],
  )

  // Auto-selecting cell 0 when the grid receives focus is for KEYBOARD entry
  // (Tab into the grid) only. A pointer press that lands on empty grid space
  // also focuses the grid div — without this guard it would wrongly select the
  // first cell right after a click-away. `onPointerDown` flags the pointer path;
  // a rAF clears it so a later Tab still auto-selects.
  const pointerFocusRef = React.useRef(false)
  const markPointerFocus = React.useCallback(() => {
    pointerFocusRef.current = true
    requestAnimationFrame(() => {
      pointerFocusRef.current = false
    })
  }, [])
  const onGridFocus = React.useCallback(
    (event: React.FocusEvent<HTMLDivElement>) => {
      if (pointerFocusRef.current) return
      if (
        event.target === gridRef.current &&
        !hasFocus &&
        rowCount > 0 &&
        colCount > 0
      ) {
        setFocused({ row: 0, col: firstFocusableCol })
      }
    },
    [hasFocus, rowCount, colCount, firstFocusableCol, gridRef],
  )

  // A cell stays focus-ringed until you click OFF it — anywhere that is not a
  // grid cell (the header, empty body space, another panel, outside the grid)
  // clears the selection. Clicking another cell keeps focus because that cell's
  // own `onMouseDown` re-sets it after this runs.
  React.useEffect(() => {
    if (!hasFocus) return
    const onPointerDown = (event: PointerEvent) => {
      const target = event.target as HTMLElement | null
      if (!target?.closest('[data-slot="grid-cell"]')) setFocused(null)
    }
    document.addEventListener("pointerdown", onPointerDown, true)
    return () =>
      document.removeEventListener("pointerdown", onPointerDown, true)
  }, [hasFocus])

  return {
    focusRow,
    focusCol,
    hasFocus,
    setFocused,
    onKeyDown,
    onGridFocus,
    markPointerFocus,
  }
}
