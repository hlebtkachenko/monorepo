"use client"

// Bare segment layout for /fakturace. It inherits the root <html>/<body> and does
// NOT use the org app-shell or auth. Forces a white, print-friendly surface with
// black text regardless of the active theme, and hosts the FakturaceProvider so
// the document state is shared across the whole single-page editor.

import type { ReactNode } from "react"

import { FakturaceProvider } from "./_lib/state"
import "./_components/print.css"

export default function FakturaceLayout({ children }: { children: ReactNode }) {
  return (
    <FakturaceProvider>
      <div className="min-h-screen bg-white text-black">{children}</div>
    </FakturaceProvider>
  )
}
