"use client"

// Účetní rozvrh page: the entity's own chart of accounts on top of the směrná
// účtová osnova. Screen-only — the rozvrh is a setting, not a tiskopis, so there
// is no print layout here; the toolbar carries its CSV import/export.

import Link from "next/link"

import { RozvrhEditor } from "../_components/rozvrh-editor"
import { Toolbar } from "../_components/toolbar"

export default function RozvrhPage() {
  return (
    <main className="vykaz-page mx-auto max-w-5xl space-y-4 p-6">
      <div>
        <Link href="/vykazy" className="text-sm text-primary hover:underline">
          ← Zpět na přehled
        </Link>
        <h1 className="mt-2 text-xl font-bold text-foreground">
          Účetní rozvrh
        </h1>
        <p className="text-sm text-muted-foreground">
          Syntetické účty a jejich zařazení do výkazů určuje vyhláška č.
          500/2002 Sb. — jsou zde jen ke čtení. Analytické účty jsou vaše:
          název, výkaz i řádek. Změna se ihned promítne do deníku, předvahy i
          výkazů.
        </p>
      </div>

      <Toolbar />
      <RozvrhEditor />
    </main>
  )
}
