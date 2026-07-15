"use client"

import * as React from "react"

/** Runtime action emitted by an interactive, data-described section control. */
export interface SectionAction {
  readonly id: string
  readonly payload?: unknown
}

type SectionActionHandler = (action: SectionAction) => void

const SectionActionContext = React.createContext<SectionActionHandler | null>(
  null,
)

export function SectionActionProvider({
  onAction,
  children,
}: {
  onAction?: SectionActionHandler
  children: React.ReactNode
}) {
  return (
    <SectionActionContext.Provider value={onAction ?? null}>
      {children}
    </SectionActionContext.Provider>
  )
}

/** Dispatches an action id from a closed section renderer to its archetype. */
export function useSectionAction(): SectionActionHandler {
  const handler = React.useContext(SectionActionContext)
  return React.useCallback(
    (action: SectionAction) => {
      handler?.(action)
    },
    [handler],
  )
}
