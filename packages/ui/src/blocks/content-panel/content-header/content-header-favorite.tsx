"use client"

import * as React from "react"

import type { ContentHeaderFavorite } from "./content-header-actions"

/**
 * Data a page hands in to get a self-managing favorite star — the initial
 * persisted state plus an async toggle that persists the flip. Unlike the
 * presentational {@link ContentHeaderFavorite} (which the caller keeps in sync),
 * the optimism is owned by {@link useOptimisticFavorite}: the page supplies only
 * the seed value + how to persist, never the live `active`/`onToggle` pair.
 *
 * `onToggle` resolves to the server-confirmed favorited state, or `void` to keep
 * the optimistic value; it MUST reject on a failed write so the star reverts.
 * The persistence itself (server action, tenancy) stays in the app — this type
 * carries only serialisable data + one callback, so a server component can build
 * it and pass it across the boundary.
 */
export interface ContentHeaderFavoriteToggle {
  /** The persisted favorited state at first paint. */
  initialActive: boolean
  /** Persist the flip; resolve to the confirmed state (or `void`), reject to revert. */
  onToggle: () => Promise<boolean | void>
  /** Hover tooltip text. Defaults to "Favorite". */
  tooltip?: string
  /** `aria-label` while inactive. Defaults to "Add to favorites". */
  addLabel?: string
  /** `aria-label` while active. Defaults to "Remove from favorites". */
  removeLabel?: string
}

/**
 * Owns the optimistic favorite state machine and returns the controlled
 * {@link ContentHeaderFavorite} the header already consumes — so the star's
 * behaviour lives in this block (rendered by every archetype) instead of being
 * re-wired per page. Pass `undefined` to opt out entirely (no star).
 *
 * The click flips the visible state inside a transition and calls `onToggle`; on
 * resolve it commits the confirmed state, on reject it reverts to the last
 * confirmed value. Hooks run unconditionally (the `undefined` opt-out is decided
 * only after), so it is safe to call every render.
 */
export function useOptimisticFavorite(
  toggle: ContentHeaderFavoriteToggle | undefined,
): ContentHeaderFavorite | undefined {
  const [active, setActive] = React.useState(toggle?.initialActive ?? false)
  const [optimisticActive, addOptimistic] = React.useOptimistic(active)
  const [, startTransition] = React.useTransition()

  const persist = toggle?.onToggle
  const onToggle = React.useCallback(() => {
    const next = !optimisticActive
    startTransition(async () => {
      addOptimistic(next)
      try {
        const confirmed = await persist?.()
        setActive(typeof confirmed === "boolean" ? confirmed : next)
      } catch {
        // Leave `active` unchanged; the optimistic value reverts to it when the
        // transition settles.
      }
    })
  }, [optimisticActive, addOptimistic, persist])

  if (!toggle) return undefined
  return {
    active: optimisticActive,
    onToggle,
    tooltip: toggle.tooltip,
    addLabel: toggle.addLabel,
    removeLabel: toggle.removeLabel,
  }
}
