"use client"

// Bare segment layout for /vykazy. It inherits the root <html>/<body> and does
// NOT use the org app-shell. Forces a white, print-friendly paper surface with
// black text regardless of the active theme, and hosts the OrgProvider so the
// document state is shared across /vykazy, /vykazy/rozvaha and /vykazy/vzz.

import type { ReactNode } from "react"

import { OrgProvider } from "./_lib/org-context"
import "./_components/print.css"

export default function VykazyLayout({ children }: { children: ReactNode }) {
  return (
    <OrgProvider>
      <div className="min-h-screen bg-white text-black">{children}</div>
    </OrgProvider>
  )
}
