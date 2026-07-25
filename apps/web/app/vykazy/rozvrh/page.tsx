"use client"

// Účtový rozvrh page: read and edit the entity's own chart of accounts (§ 14
// zákona č. 563/1991 Sb.). Screen-only — the rozvrh is not a statutory výkaz, so
// there is no printed form here.

import Link from "next/link"

import { RozvrhTable } from "../_components/rozvrh-table"
import { Toolbar } from "../_components/toolbar"

export default function RozvrhPage() {
  return (
    <main className="vykaz-page mx-auto max-w-5xl space-y-4 p-6">
      <div className="no-print">
        <Link href="/vykazy" className="text-sm text-primary hover:underline">
          ← Zpět na přehled
        </Link>
      </div>

      <div className="no-print">
        <h1 className="text-xl font-bold text-foreground">Účtový rozvrh</h1>
        <p className="text-sm text-muted-foreground">
          Účty účetní jednotky podle § 14 zákona č. 563/1991 Sb. Doplňuje
          směrnou účtovou osnovu o názvy analytických účtů.
        </p>
      </div>

      <Toolbar />
      <RozvrhTable />
    </main>
  )
}
