"use client"

// The účtový rozvrh as a table you can read and edit: every account the chart
// carries, which of them the deník actually posts to, and the accounts the deník
// posts to that the chart does not name yet. Edits go straight back into the
// document (JSON export + localStorage) and out again as CSV, so a name fixed
// here can be carried into the sheet the chart came from.
//
// A syntetický účet's placement is the vyhláška's and is shown read-only. An
// analytický účet's is the účetní jednotka's (§ 14), so it gets a picker: the
// same synthetic can carry analytics that report on different řádky — 395
// vnitřní zúčtování splits into a pohledávka and a závazek. Only leaf řádky are
// offered; a calculated one is the sum of its children and would double-count.

import { useMemo, useState } from "react"

import { Button } from "@workspace/ui/components/button"

import { useOrg } from "../_lib/org-context"
import {
  leafOptions,
  rozvrhCsv,
  VYKAZ_NAZEV,
  type RozvrhAccount,
} from "../_lib/rozvrh"
import type { StatementKey } from "../_lib/storage"

type Filter = "vse" | "vdeniku" | "chybejici" | "opravkove" | "zarazene"

const FILTER_LABEL: Record<Filter, string> = {
  vse: "Vše",
  vdeniku: "Účtované v deníku",
  chybejici: "Chybí v rozvrhu",
  opravkove: "Oprávkové",
  zarazene: "Vlastní zařazení",
}

const VYKAZY: StatementKey[] = ["rozvaha-aktiva", "rozvaha-pasiva", "vzz"]

/** A syntetický účet is the bare 3-digit number, or a 6-digit one ending 000. */
function isSynteticky(ucet: string): boolean {
  return ucet.length === 3 || /^\d{3}0+$/.test(ucet)
}

function download(content: string, filename: string) {
  const blob = new Blob([content], { type: "text/csv;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const anchor = document.createElement("a")
  anchor.href = url
  anchor.download = filename
  document.body.appendChild(anchor)
  anchor.click()
  anchor.remove()
  URL.revokeObjectURL(url)
}

export function RozvrhTable() {
  const { rozvrh, predvaha, importRozvrh, resolveUcetName, org, crVariant } =
    useOrg()
  const [filter, setFilter] = useState<Filter>("vse")
  const [query, setQuery] = useState("")
  const [novyUcet, setNovyUcet] = useState("")

  // Accounts the deník posts to, and the ones the chart has no row for. The
  // second list is the drift that matters: a posted account nobody named.
  const { posted, missing } = useMemo(() => {
    const inRozvrh = new Set(rozvrh.map((a) => a.ucet))
    const postedSet = new Set(predvaha.ucty.map((u) => u.ucet))
    return {
      posted: postedSet,
      missing: [...postedSet].filter((u) => !inRozvrh.has(u)).sort(),
    }
  }, [rozvrh, predvaha])

  const rows = useMemo(() => {
    const q = query.trim().toLowerCase()
    const base: RozvrhAccount[] =
      filter === "chybejici"
        ? missing.map((ucet) => ({ ucet, nazev: "" }))
        : [...rozvrh].sort((a, b) => a.ucet.localeCompare(b.ucet, "cs"))
    return base
      .filter((a) => {
        if (filter === "vdeniku" && !posted.has(a.ucet)) return false
        if (filter === "opravkove" && !a.opravkovy) return false
        if (filter === "zarazene" && a.vykaz === undefined) return false
        return true
      })
      .filter(
        (a) =>
          q === "" || a.ucet.includes(q) || a.nazev.toLowerCase().includes(q),
      )
  }, [rozvrh, missing, posted, filter, query])

  const patch = (ucet: string, change: Partial<RozvrhAccount>) => {
    const existing = rozvrh.find((a) => a.ucet === ucet)
    const next: RozvrhAccount = {
      ...(existing ?? { ucet, nazev: "" }),
      ...change,
    }
    importRozvrh([...rozvrh.filter((a) => a.ucet !== ucet), next])
  }

  // Clearing the výkaz clears the řádek with it: half a placement would be
  // carried into the CSV and refused on the way back in. Setting one seeds the
  // first leaf of that statement so the row is never a statement with no řádek.
  const setVykaz = (a: RozvrhAccount, raw: string) => {
    if (raw === "") {
      patch(a.ucet, { vykaz: undefined, rada: undefined })
      return
    }
    const vykaz = raw as StatementKey
    const options = leafOptions(vykaz, crVariant)
    patch(a.ucet, { vykaz, rada: a.rada ?? options[0]?.rada })
  }

  const remove = (ucet: string) =>
    importRozvrh(rozvrh.filter((a) => a.ucet !== ucet))

  const add = (ucet: string) => {
    const clean = ucet.replace(/\s/g, "")
    if (!/^\d{3,6}$/.test(clean)) {
      window.alert("Číslo účtu musí mít 3 až 6 číslic.")
      return
    }
    if (rozvrh.some((a) => a.ucet === clean)) {
      window.alert(`Účet ${clean} už v rozvrhu je.`)
      return
    }
    // Seed with the statutory name so the row is never born empty.
    importRozvrh([...rozvrh, { ucet: clean, nazev: resolveUcetName(clean) }])
    setNovyUcet("")
  }

  const nameless = rozvrh.filter((a) => a.nazev.trim() === "").length

  return (
    <section className="space-y-4 text-sm">
      <div className="flex flex-wrap items-center gap-2">
        {(Object.keys(FILTER_LABEL) as Filter[]).map((f) => (
          <Button
            key={f}
            type="button"
            size="sm"
            variant={filter === f ? "default" : "outline"}
            onClick={() => setFilter(f)}
          >
            {FILTER_LABEL[f]}
            {f === "chybejici" && missing.length > 0
              ? ` (${missing.length})`
              : ""}
          </Button>
        ))}
        <input
          value={query}
          onChange={(e) => setQuery(e.target.value)}
          placeholder="Hledat účet nebo název"
          className="h-8 min-w-56 flex-1 rounded border border-border bg-background px-2"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          disabled={rozvrh.length === 0}
          onClick={() =>
            download(
              rozvrhCsv(rozvrh),
              `uctovy-rozvrh${org.ico ? `-${org.ico}` : ""}.csv`,
            )
          }
        >
          Export rozvrhu (CSV)
        </Button>
      </div>

      <div className="flex flex-wrap items-center gap-x-6 gap-y-1 text-xs text-muted-foreground">
        <span>{rozvrh.length} účtů v rozvrhu</span>
        <span>{predvaha.ucty.length} účtů účtováno v deníku</span>
        <span
          className={
            missing.length > 0 ? "font-semibold text-amber-600" : undefined
          }
        >
          {missing.length} účtováno bez řádku v rozvrhu
        </span>
        {nameless > 0 ? (
          <span className="font-semibold text-amber-600">
            {nameless} bez názvu
          </span>
        ) : null}
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <input
          value={novyUcet}
          onChange={(e) => setNovyUcet(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") add(novyUcet)
          }}
          placeholder="Přidat účet, např. 221006"
          className="h-8 w-52 rounded border border-border bg-background px-2"
        />
        <Button
          type="button"
          size="sm"
          variant="outline"
          onClick={() => add(novyUcet)}
        >
          Přidat
        </Button>
      </div>

      <div className="max-h-[32rem] overflow-auto rounded border border-border">
        <table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-muted">
            <tr>
              <th className="px-2 py-1 text-left font-semibold">Účet</th>
              <th className="px-2 py-1 text-left font-semibold">Název</th>
              <th className="px-2 py-1 text-center font-semibold">Oprávkový</th>
              <th className="px-2 py-1 text-left font-semibold">Zařazení</th>
              <th className="px-2 py-1 text-center font-semibold">V deníku</th>
              <th className="px-2 py-1" />
            </tr>
          </thead>
          <tbody>
            {rows.map((a) => (
              <tr key={a.ucet} className="border-b border-border">
                <td className="px-2 py-0.5 font-mono">{a.ucet}</td>
                <td className="px-1 py-0.5">
                  <input
                    value={a.nazev}
                    placeholder={resolveUcetName(a.ucet) || "bez názvu"}
                    onChange={(e) => patch(a.ucet, { nazev: e.target.value })}
                    className="w-full rounded border border-transparent bg-transparent px-1 py-0.5 hover:border-border focus:border-border focus:bg-background focus:outline-none"
                  />
                </td>
                <td className="px-2 py-0.5 text-center">
                  <input
                    type="checkbox"
                    checked={a.opravkovy ?? false}
                    onChange={(e) =>
                      patch(a.ucet, { opravkovy: e.target.checked })
                    }
                    aria-label={`Účet ${a.ucet} je oprávkový`}
                  />
                </td>
                <td className="px-1 py-0.5">
                  {isSynteticky(a.ucet) ? (
                    <span className="px-1 text-xs text-muted-foreground">
                      dle vyhlášky
                    </span>
                  ) : (
                    <div className="flex items-center gap-1">
                      <select
                        value={a.vykaz ?? ""}
                        onChange={(e) => setVykaz(a, e.target.value)}
                        aria-label={`Výkaz účtu ${a.ucet}`}
                        className="h-6 rounded border border-transparent bg-transparent px-1 hover:border-border focus:border-border focus:bg-background focus:outline-none"
                      >
                        <option value="">dle vyhlášky</option>
                        {VYKAZY.map((v) => (
                          <option key={v} value={v}>
                            {VYKAZ_NAZEV[v]}
                          </option>
                        ))}
                      </select>
                      {a.vykaz ? (
                        <select
                          value={a.rada ?? ""}
                          onChange={(e) =>
                            patch(a.ucet, { rada: e.target.value })
                          }
                          aria-label={`Řádek účtu ${a.ucet}`}
                          className="h-6 min-w-0 flex-1 rounded border border-border bg-background px-1 focus:outline-none"
                        >
                          {leafOptions(a.vykaz, crVariant).map((o) => (
                            <option key={o.rada} value={o.rada}>
                              {o.label}
                            </option>
                          ))}
                        </select>
                      ) : null}
                    </div>
                  )}
                </td>
                <td className="px-2 py-0.5 text-center text-muted-foreground">
                  {posted.has(a.ucet) ? "✓" : ""}
                </td>
                <td className="px-2 py-0.5 text-right">
                  <button
                    type="button"
                    onClick={() => remove(a.ucet)}
                    className="cursor-pointer text-muted-foreground hover:text-destructive"
                    aria-label={`Odebrat účet ${a.ucet}`}
                  >
                    ×
                  </button>
                </td>
              </tr>
            ))}
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-2 py-6 text-center text-muted-foreground"
                >
                  {rozvrh.length === 0
                    ? "Žádný účtový rozvrh není načten. Použijte Import rozvrh (CSV) v liště výše."
                    : "Žádný účet neodpovídá filtru."}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      <p className="text-xs text-muted-foreground">
        Rozvrh určuje názvy účtů, příznak oprávkového účtu a u analytických účtů
        i zařazení do řádku výkazu. Syntetické účty zařazuje vyhláška č.
        500/2002 Sb. a rozvrhem je změnit nelze. Nabízejí se jen součtové listy
        výkazu: na počítaný řádek účet zařadit nelze, sečetl by se dvakrát.
      </p>
    </section>
  )
}
