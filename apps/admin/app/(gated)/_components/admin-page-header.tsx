"use client"

import * as React from "react"
import { createPortal } from "react-dom"

/**
 * Content-header seam between the persistent shell and the active page.
 *
 * The shell owns the content-panel header SLOT (a Next layout can't read a child
 * page's exports), but a detail page/layout needs to render its own title +
 * tabs there. The shell renders an empty portal TARGET in the slot; a page
 * renders `<AdminPageHeader>` whose node `createPortal`s into that target —
 * staying in the page's React tree (its router/state) while its DOM lands in
 * the shell header. With no page override, the shell shows the nav-derived
 * title fallback.
 */

interface SlotContext {
  el: HTMLElement | null
  setEl: (el: HTMLElement | null) => void
  claimed: boolean
  setClaimed: (claimed: boolean) => void
}

const Ctx = React.createContext<SlotContext | null>(null)

export function AdminPageHeaderProvider({
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

export function AdminContentHeaderSlot({
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

export function AdminPageHeader({ children }: { children: React.ReactNode }) {
  const ctx = React.useContext(Ctx)
  const setClaimed = ctx?.setClaimed
  React.useEffect(() => {
    setClaimed?.(true)
    return () => setClaimed?.(false)
  }, [setClaimed])
  if (!ctx?.el) return null
  return createPortal(children, ctx.el)
}
