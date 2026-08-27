"use client"

// Obratová předvaha page: printed masthead + toolbar + the full trial-balance
// table, all derived live from the editable deník. A screen-only CSV button
// exports the same statement. Print (Tisk / PDF) lays it out for A4 like the
// rozvaha / VZZ pages.

import { useMemo } from "react"
import Link from "next/link"

import { Button } from "@workspace/ui/components/button"

import { PredvahaStatement } from "../_components/predvaha-statement"
import { StatementFooter } from "../_components/statement-footer"
import { StatementHeader } from "../_components/statement-header"
import { Toolbar } from "../_components/toolbar"
import { useOrg } from "../_lib/org-context"
import { buildPredvahaStatement, predvahaCsv } from "../_lib/predvaha-statement"
import { STATEMENT_HEADER_PT } from "../_lib/print-pagination"

export default function PredvahaPage() {
  const { denik, org, rozvrh } = useOrg()
  // Two builds of the same statement: the exact-Kč one backs the CSV export and
  // the MD = Dal control totals, the displayed one carries the unit the whole set
  // of výkazů prints in (and, in tisíce, an allocation that makes it foot).
  const exact = useMemo(
    () => buildPredvahaStatement(denik, { rozvrh }),
    [denik, rozvrh],
  )
  const statement = useMemo(
    () => buildPredvahaStatement(denik, { vTisicich: org.vTisicich, rozvrh }),
    [denik, org.vTisicich, rozvrh],
  )

  const downloadCsv = () => {
    const blob = new Blob([predvahaCsv(exact)], {
      type: "text/csv;charset=utf-8",
    })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = `obratova-predvaha${org.ico ? `-${org.ico}` : ""}.csv`
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  return (
    <main className="vykaz-page mx-auto max-w-5xl space-y-4 p-6">
      <div className="no-print">
        <Link href="/vykazy" className="text-sm text-primary hover:underline">
          ← Zpět na přehled
        </Link>
      </div>

      <Toolbar />

      <div className="no-print flex flex-wrap items-center gap-2">
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={downloadCsv}
          disabled={statement.empty}
        >
          Export předvahy (CSV)
        </Button>
      </div>

      <div className="vykaz-paper space-y-6">
        {/* Unit follows the shared `v celých tisících Kč` toggle, same as the
            rozvaha / VZZ — so the whole set of výkazů prints in one unit. */}
        <StatementHeader
          heading="Obratová předvaha"
          forcePlny
          hideRozsah
          hideLegalNote
        />

        <section className="vykaz-statement predvaha-statement">
          <PredvahaStatement
            statement={statement}
            control={exact.total}
            vTisicich={org.vTisicich}
            firstPagePt={STATEMENT_HEADER_PT}
          />
        </section>

        <StatementFooter />
      </div>
    </main>
  )
}
