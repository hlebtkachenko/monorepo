"use client"

// Bare segment layout for /vykazy. It inherits the root <html>/<body> and does
// NOT use the org app-shell, but it does follow the app theme: the page chrome
// (toolbar, org form, deník) is token-based and goes dark with the rest of the
// app, while every statement stays on a white `.vykaz-paper` surface with black
// text — it is a tiskopis, and it is what gets printed. Hosts the OrgProvider so
// the document state is shared across all /vykazy pages.

import type { ReactNode } from "react"

import { OrgProvider } from "./_lib/org-context"
import "./_components/print.css"

export default function VykazyLayout({ children }: { children: ReactNode }) {
  return (
    <OrgProvider>
      <div className="min-h-screen bg-background text-foreground">
        {children}
      </div>
    </OrgProvider>
  )
}
