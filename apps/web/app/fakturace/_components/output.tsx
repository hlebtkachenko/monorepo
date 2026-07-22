"use client"

// Section 4 — invoice metadata + the two deliverables. Export the Faktura as
// ISDOC 6.0.1 XML (guarded — the button is disabled with a field checklist until
// the writer's required inputs are present) or PDF, and the Report as XML or PDF.
// PDF uses selective print scoping: body[data-print] hides everything but the
// chosen document; the flag is cleared on `afterprint` (print is async).

import { useState } from "react"

import { Button } from "@workspace/ui/components/button"

import { useFakturace } from "../_lib/state"
import { buildIsdocXml } from "../_lib/isdoc-action"
import { isdocReadiness } from "../_lib/isdoc-map"
import { serializeReport } from "../_lib/report-xml"
import { docFilename, downloadXml } from "../_lib/xml"
import { Section, TextArea, TextField } from "./fields"
import { InvoiceDoc } from "./invoice-doc"
import { ReportDoc } from "./report-doc"

type PrintTarget = "invoice" | "report"

function printDoc(target: PrintTarget) {
  document.body.dataset.print = target
  const clear = () => {
    delete document.body.dataset.print
    window.removeEventListener("afterprint", clear)
  }
  window.addEventListener("afterprint", clear)
  window.print()
}

function InvoiceMetaForm() {
  const { doc, setMeta } = useFakturace()
  const { meta } = doc
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
      <TextField
        label="Číslo faktury"
        value={meta.cisloFaktury}
        onChange={(v) => setMeta({ cisloFaktury: v })}
      />
      <TextField
        label="Variabilní symbol"
        value={meta.variabilniSymbol}
        onChange={(v) => setMeta({ variabilniSymbol: v })}
        inputMode="numeric"
      />
      <TextField
        label="Fakturační období"
        value={meta.obdobi}
        onChange={(v) => setMeta({ obdobi: v })}
        placeholder="např. Červen 2025"
      />
      <TextField
        label="Datum vystavení"
        type="date"
        value={meta.datumVystaveni}
        onChange={(v) => setMeta({ datumVystaveni: v })}
      />
      <TextField
        label="Datum uskutečnění plnění"
        type="date"
        value={meta.datumUskutecneni}
        onChange={(v) => setMeta({ datumUskutecneni: v })}
      />
      <TextField
        label="Datum splatnosti"
        type="date"
        value={meta.datumSplatnosti}
        onChange={(v) => setMeta({ datumSplatnosti: v })}
      />
      <TextField
        label="Způsob úhrady"
        value={meta.zpusobUhrady}
        onChange={(v) => setMeta({ zpusobUhrady: v })}
      />
      <TextField
        label="Vystavil"
        value={meta.vystavil}
        onChange={(v) => setMeta({ vystavil: v })}
      />
      <TextArea
        label="Poznámka na fakturu"
        value={meta.poznamkaFaktura}
        onChange={(v) => setMeta({ poznamkaFaktura: v })}
        className="sm:col-span-2 lg:col-span-3"
      />
      <TextArea
        label="Poznámka do reportu"
        value={meta.poznamkaReport}
        onChange={(v) => setMeta({ poznamkaReport: v })}
        className="sm:col-span-2 lg:col-span-3"
      />
    </div>
  )
}

function ExportBar() {
  const { doc } = useFakturace()
  const [isdocError, setIsdocError] = useState<string | null>(null)
  const [busy, setBusy] = useState(false)
  const readiness = isdocReadiness(doc)

  const baseName = docFilename(doc).replace(/\.xml$/, "")

  const exportIsdoc = async () => {
    setIsdocError(null)
    setBusy(true)
    try {
      const res = await buildIsdocXml(doc)
      if (res.ok) downloadXml(`${baseName}.isdoc`, res.xml)
      else setIsdocError(res.error)
    } finally {
      setBusy(false)
    }
  }

  const exportReportXml = () => {
    downloadXml(`vykaz-${baseName}.xml`, serializeReport(doc))
  }

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-neutral-600">Faktura:</span>
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={() => printDoc("invoice")}
        >
          Faktura → PDF
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          disabled={!readiness.ok || busy}
          onClick={() => void exportIsdoc()}
        >
          {busy ? "Generuji…" : "Faktura → ISDOC XML"}
        </Button>
      </div>
      {!readiness.ok ? (
        <p className="text-xs text-amber-600">
          Pro ISDOC doplňte: {readiness.missing.join(", ")}.
        </p>
      ) : null}
      {isdocError ? <p className="text-xs text-red-600">{isdocError}</p> : null}

      <div className="flex flex-wrap items-center gap-2">
        <span className="text-xs font-semibold text-neutral-600">Report:</span>
        <Button
          type="button"
          variant="default"
          size="sm"
          onClick={() => printDoc("report")}
        >
          Report → PDF
        </Button>
        <Button
          type="button"
          variant="outline"
          size="sm"
          onClick={exportReportXml}
        >
          Report → XML
        </Button>
      </div>
    </div>
  )
}

export function Output() {
  return (
    <>
      <Section
        id="output"
        title="4. Faktura a report"
        description="Doplňte údaje faktury a stáhněte oba dokumenty. Nic dalšího se nevyplňuje."
      >
        <InvoiceMetaForm />
        <div className="mt-4 border-t border-neutral-200 pt-3">
          <ExportBar />
        </div>
      </Section>

      <div className="space-y-6">
        <div className="rounded-lg border border-neutral-200 shadow-sm print:border-0 print:shadow-none">
          <InvoiceDoc />
        </div>
        <div className="rounded-lg border border-neutral-200 shadow-sm print:border-0 print:shadow-none">
          <ReportDoc />
        </div>
      </div>
    </>
  )
}
