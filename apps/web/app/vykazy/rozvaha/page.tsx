"use client"

// Rozvaha page: printed header + toolbar + the aktiva and pasiva tables, each
// wired to its own value map (aktiva + pasiva řádek numbers overlap). Rozsah /
// hide-empty come from context; filtering happens inside VykazTable so formulas
// keep evaluating over all lines.

import Link from "next/link"

import { StatementFooter } from "../_components/statement-footer"
import { StatementHeader } from "../_components/statement-header"
import { Toolbar } from "../_components/toolbar"
import { VykazTable } from "../_components/vykaz-table"
import { useOrg } from "../_lib/org-context"
import { STATEMENT_HEADER_PT } from "../_lib/print-pagination"
import { rozvahaAktiva, rozvahaPasiva } from "../_data/rozvaha"
import type { ColKey } from "../_lib/types"

export default function RozvahaPage() {
  const { values, rozsah, crVariant, hideEmpty, setCell } = useOrg()

  const onAktivaChange = (rada: string, col: ColKey, value: number | null) =>
    setCell("rozvaha-aktiva", rada, col, value)
  const onPasivaChange = (rada: string, col: ColKey, value: number | null) =>
    setCell("rozvaha-pasiva", rada, col, value)

  return (
    <main className="vykaz-page mx-auto max-w-5xl space-y-4 p-6">
      <div className="no-print">
        <Link href="/vykazy" className="text-sm text-primary hover:underline">
          ← Zpět na přehled
        </Link>
      </div>

      <Toolbar />

      <div className="vykaz-paper space-y-6">
        <StatementHeader heading="Rozvaha" />

        <section className="vykaz-statement">
          <VykazTable
            statement={rozvahaAktiva(crVariant)}
            columnBLabel="AKTIVA"
            colValues={values.rozvahaAktiva}
            rozsah={rozsah}
            hideEmpty={hideEmpty}
            firstPagePt={STATEMENT_HEADER_PT}
            onCellChange={onAktivaChange}
          />
        </section>

        <section className="vykaz-statement">
          <VykazTable
            statement={rozvahaPasiva(crVariant)}
            columnBLabel="PASIVA"
            colValues={values.rozvahaPasiva}
            rozsah={rozsah}
            hideEmpty={hideEmpty}
            onCellChange={onPasivaChange}
          />
        </section>

        <StatementFooter />
      </div>
    </main>
  )
}
