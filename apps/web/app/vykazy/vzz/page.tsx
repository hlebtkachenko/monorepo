"use client"

// Výkaz zisku a ztráty page: printed header + toolbar + the single VZZ table,
// wired to the shared "vzz" value map.

import Link from "next/link"

import { StatementFooter } from "../_components/statement-footer"
import { StatementHeader } from "../_components/statement-header"
import { Toolbar } from "../_components/toolbar"
import { VykazTable } from "../_components/vykaz-table"
import { useOrg } from "../_lib/org-context"
import { VZZ } from "../_data/vzz"
import type { ColKey } from "../_lib/types"

export default function VzzPage() {
  const { values, rozsah, hideEmpty, setCell } = useOrg()

  const onCellChange = (rada: string, col: ColKey, value: number | null) =>
    setCell("vzz", rada, col, value)

  return (
    <main className="vykaz-page mx-auto max-w-5xl space-y-4 p-6">
      <div className="no-print">
        <Link href="/vykazy" className="text-sm text-blue-600 hover:underline">
          ← Zpět na přehled
        </Link>
      </div>

      <Toolbar />

      <section className="vykaz-statement">
        <StatementHeader heading="Výkaz zisku a ztráty" forcePlny />
        <VykazTable
          statement={VZZ}
          columnBLabel="TEXT"
          colValues={values.vzz}
          rozsah={rozsah}
          hideEmpty={hideEmpty}
          onCellChange={onCellChange}
        />
      </section>

      <StatementFooter />
    </main>
  )
}
