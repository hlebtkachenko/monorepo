"use client"

import * as React from "react"

/**
 * `calmErrorsEnabled()` is a SERVER fact. This carries it to the handful of
 * Client Components that have to act on it.
 *
 * WHY A CONTEXT AND NOT A PROP. The portal's established shape for a server
 * flag is a boolean prop — `(portal)/[orgSlug]/layout.tsx` resolves
 * `BETA_ASSISTANT_ENABLED` on the server and hands `showAssistant` to
 * `BetaShell` for exactly this reason. That works everywhere a server parent
 * renders the client child. It does NOT work for `error.tsx`: Next constructs
 * the error boundary itself and passes it `error` + `reset` and nothing else,
 * so there is no parent left to hand it a prop. A context mounted once in the
 * root layout reaches every boundary below it, and the flag still crosses the
 * seam as a single boolean resolved on the server.
 *
 * WHY NOT `process.env.BETA_DEMO_CALM_ERRORS` INSIDE THE CLIENT COMPONENT. Next
 * only inlines `NEXT_PUBLIC_`-prefixed variables into the browser bundle. A bare
 * read would be the real string during a server render and `undefined` after
 * hydration — a boundary that renders calm and then flips to red one tick later,
 * which is a worse demo than never having calmed it. Renaming the variable to
 * `NEXT_PUBLIC_*` would fix the mismatch by publishing the flag to every visitor
 * instead; the provider keeps it server-side.
 *
 * DEFAULTS TO `false`. A tree without the provider — a component test rendering
 * in isolation, or `global-error.tsx`, which replaces the root layout and
 * therefore this provider with it — behaves exactly as the portal does today.
 * "Off" is the safe direction: it shows a real error, it never hides one.
 */
const CalmErrorsContext = React.createContext(false)

export function CalmErrorsProvider({
  enabled,
  children,
}: Readonly<{ enabled: boolean; children: React.ReactNode }>) {
  return (
    <CalmErrorsContext.Provider value={enabled}>
      {children}
    </CalmErrorsContext.Provider>
  )
}

/** True when this render should hide system failures behind a pending state. */
export function useCalmErrors(): boolean {
  return React.useContext(CalmErrorsContext)
}
