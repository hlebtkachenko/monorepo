"use client"

import * as React from "react"
import { createPortal } from "react-dom"

/**
 * Content-header seam between the persistent shell and the active page.
 *
 * The shell owns the content-panel header SLOT (a Next layout can't read a child
 * page's exports), but a page needs to render its own title/tabs/actions there.
 * Solution: the shell renders an empty portal TARGET in the slot; a page renders
 * `<OrgPageHeader>` with its header node, which `createPortal`s into that target.
 * Because it's a portal, the node stays in the PAGE's React tree (keeps the
 * page's context/state) while its DOM lands in the shell header. When no page
 * provides one, the shell shows a nav-derived title fallback.
 */

interface SlotContext {
  el: HTMLElement | null
  setEl: (el: HTMLElement | null) => void
  claimed: boolean
  setClaimed: (claimed: boolean) => void
}

const Ctx = React.createContext<SlotContext | null>(null)

/** Wraps the shell so the header slot + the page children share the target el. */
export function OrgPageHeaderProvider({
  children,
}: {
  children: React.ReactNode
}) {
  const [el, setEl] = React.useState<HTMLElement | null>(null)
  const [claimed, setClaimed] = React.useState(false)
  const value = React.useMemo<SlotContext>(
    () => ({ el, setEl, claimed, setClaimed }),
    [el, claimed],
  )
  return <Ctx.Provider value={value}>{children}</Ctx.Provider>
}

/**
 * The shell's content-header slot: a portal target plus a fallback shown until a
 * page claims it. Render into `AppShell`'s `contentHeader`.
 */
export function OrgContentHeaderSlot({
  fallback,
}: {
  fallback: React.ReactNode
}) {
  const ctx = React.useContext(Ctx)
  return (
    <>
      <div ref={ctx?.setEl ?? null} className="contents" />
      {ctx?.claimed ? null : fallback}
    </>
  )
}

/** Render a page's header node into the shell's content-header slot. */
export function OrgPageHeader({ children }: { children: React.ReactNode }) {
  const ctx = React.useContext(Ctx)
  const setClaimed = ctx?.setClaimed
  React.useEffect(() => {
    setClaimed?.(true)
    return () => setClaimed?.(false)
  }, [setClaimed])
  if (!ctx?.el) return null
  return createPortal(children, ctx.el)
}
