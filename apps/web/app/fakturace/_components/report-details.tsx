"use client"

// Report-only detail: structured work-volume metrics (počet dokladů, headcount,
// …) and the list of submitted filings (podaná hlášení). Kept SEPARATE from the
// billing lines — it enriches the Výkaz práce without touching the faktura math.

import { Button } from "@workspace/ui/components/button"

import { useFakturace } from "../_lib/state"
import { TextField } from "./fields"

function MetricsEditor() {
  const { doc, addMetric, updateMetric, removeMetric } = useFakturace()
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-700">
          Přehled činností (metriky)
        </h3>
        <Button type="button" variant="outline" size="sm" onClick={addMetric}>
          + Přidat metriku
        </Button>
      </div>
      {doc.reportMetrics.length === 0 ? (
        <p className="text-xs text-neutral-400">
          Žádné metriky. Např. „Zpracované doklady = 42“, „Zaměstnanců na mzdách
          = 5“.
        </p>
      ) : (
        <div className="space-y-2">
          {doc.reportMetrics.map((m) => (
            <div
              key={m.id}
              className="grid grid-cols-1 gap-2 rounded border border-neutral-200 p-2 sm:grid-cols-12"
            >
              <TextField
                label="Popis"
                value={m.label}
                onChange={(v) => updateMetric(m.id, { label: v })}
                placeholder="Zpracované doklady"
                className="sm:col-span-7"
              />
              <TextField
                label="Hodnota"
                value={m.value}
                onChange={(v) => updateMetric(m.id, { value: v })}
                placeholder="42"
                className="sm:col-span-4"
              />
              <div className="flex items-end sm:col-span-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeMetric(m.id)}
                >
                  ×
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

function FilingsEditor() {
  const { doc, addFiling, updateFiling, removeFiling } = useFakturace()
  return (
    <div className="rounded-lg border border-neutral-200 bg-white p-3">
      <div className="mb-2 flex items-center justify-between">
        <h3 className="text-sm font-semibold text-neutral-700">
          Podaná hlášení
        </h3>
        <Button type="button" variant="outline" size="sm" onClick={addFiling}>
          + Přidat hlášení
        </Button>
      </div>
      {doc.filings.length === 0 ? (
        <p className="text-xs text-neutral-400">Žádná podaná hlášení.</p>
      ) : (
        <div className="space-y-2">
          {doc.filings.map((f) => (
            <div
              key={f.id}
              className="grid grid-cols-1 gap-2 rounded border border-neutral-200 p-2 sm:grid-cols-12"
            >
              <TextField
                label="Název"
                value={f.nazev}
                onChange={(v) => updateFiling(f.id, { nazev: v })}
                placeholder="Přehled OSSZ 06/2025"
                className="sm:col-span-8"
              />
              <TextField
                label="Datum podání"
                type="date"
                value={f.datum}
                onChange={(v) => updateFiling(f.id, { datum: v })}
                className="sm:col-span-3"
              />
              <div className="flex items-end sm:col-span-1">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  onClick={() => removeFiling(f.id)}
                >
                  ×
                </Button>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  )
}

export function ReportDetails() {
  return (
    <div className="space-y-3">
      <MetricsEditor />
      <FilingsEditor />
    </div>
  )
}
