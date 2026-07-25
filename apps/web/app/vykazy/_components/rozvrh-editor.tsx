"use client"

// Editable účetní rozvrh: one row per account, listing everything the deník uses
// plus everything the rozvrh already names. Every edit writes the whole rozvrh
// back through the context, which re-maps the deník onto the výkazy immediately.
//
// The two ownership levels of § 14 zákona o účetnictví are the whole point of the
// layout: a syntetický účet ("311", "311000") shows the osnova name and the
// vyhláška's placement as read-only text, while an analytický účet ("311100")
// exposes an editable name, its own výkaz + řádek, and the korekce flag. An
// analytika with no own placement is shown the law default of its synthetic as
// the placeholder, so the picker never hides where the value currently lands.
// Screen-only (.no-print).

import { useMemo, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { useOrg } from "../_lib/org-context"
import { formatKc } from "../_lib/format"
import { lawPlacement } from "../_lib/mapping"
import {
  isSynteticky,
  leafLabel,
  leafOptions,
  osnovaNazev,
  resolveOpravkovy,
  buildRozvrhIndex,
  VYKAZ_NAZEV,
} from "../_lib/rozvrh"
import type { RozvrhAccount } from "../_lib/rozvrh"
import type { StatementKey } from "../_lib/storage"

const INPUT_CLASS =
  "w-full min-w-0 bg-transparent px-2 py-1.5 text-[13px] outline-none focus:bg-blue-50 focus:ring-1 focus:ring-blue-300"

/** One rendered row: the account plus everything resolved about it. */
interface Row {
  ucet: string
  synteticky: boolean
  /** The entity's own entry, when the rozvrh has one. */
  own: RozvrhAccount | undefined
  osnova: string
  /** Konečný zůstatek from the deník, or null when the account is unused. */
  ks: number | null
  law: { vykaz: StatementKey; rada: string } | null
}

/** An account entry is worth storing only when it says something. */
function isMeaningful(account: RozvrhAccount): boolean {
  return (
    account.nazev.trim() !== "" ||
    account.opravkovy === true ||
    (account.vykaz !== undefined && account.rada !== undefined)
  )
}

export function RozvrhEditor() {
  const { predvaha, rozvrh, setRozvrh, crVariant } = useOrg()
  const [newUcet, setNewUcet] = useState("")
  const [addError, setAddError] = useState<string | null>(null)

  const rows: Row[] = useMemo(() => {
    const index = buildRozvrhIndex(rozvrh)
    const ks = new Map(predvaha.ucty.map((u) => [u.ucet, u.ks]))
    const numbers = new Set([
      ...predvaha.ucty.map((u) => u.ucet),
      ...rozvrh.map((a) => a.ucet),
    ])
    return [...numbers]
      .sort((a, b) => a.localeCompare(b, "cs"))
      .map((ucet) => {
        const law = lawPlacement(ucet, crVariant)
        return {
          ucet,
          synteticky: isSynteticky(ucet),
          own: index.get(ucet),
          osnova: osnovaNazev(ucet),
          ks: ks.get(ucet) ?? null,
          law: law ? { vykaz: law.statement, rada: law.rada } : null,
        }
      })
  }, [predvaha, rozvrh, crVariant])

  const rozvrhIndex = useMemo(() => buildRozvrhIndex(rozvrh), [rozvrh])

  /** Upsert one account into the rozvrh (dropping it when it says nothing). */
  const patch = (ucet: string, change: Partial<RozvrhAccount>) => {
    const current = rozvrhIndex.get(ucet) ?? { ucet, nazev: "" }
    const next: RozvrhAccount = { ...current, ...change }
    if (next.vykaz === undefined) delete next.rada
    const others = rozvrh.filter((a) => a.ucet !== ucet)
    setRozvrh(isMeaningful(next) ? [...others, next] : others)
  }

  const addAccount = () => {
    const ucet = newUcet.replace(/\s/g, "")
    if (!/^\d{3,6}$/.test(ucet)) {
      setAddError("Zadejte číslo účtu (3–6 číslic).")
      return
    }
    if (rows.some((r) => r.ucet === ucet)) {
      setAddError(`Účet ${ucet} už v rozvrhu je.`)
      return
    }
    setAddError(null)
    setNewUcet("")
    setRozvrh([...rozvrh, { ucet, nazev: osnovaNazev(ucet) }])
  }

  return (
    <div className="no-print space-y-3">
      <div className="flex flex-wrap items-end gap-2">
        <div>
          <label
            htmlFor="rozvrh-novy-ucet"
            className="block text-xs text-muted-foreground"
          >
            Přidat účet
          </label>
          <input
            id="rozvrh-novy-ucet"
            value={newUcet}
            inputMode="numeric"
            placeholder="311100"
            className="w-32 rounded border border-border bg-background px-2 py-1.5 text-[13px] outline-none focus:ring-1 focus:ring-blue-300"
            onChange={(e) => setNewUcet(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") addAccount()
            }}
          />
        </div>
        <Button type="button" variant="outline" size="sm" onClick={addAccount}>
          Přidat
        </Button>
        {addError ? (
          <span className="text-xs text-destructive">{addError}</span>
        ) : null}
      </div>

      <div className="overflow-auto rounded border border-border">
        <table className="w-full border-collapse text-[13px]">
          <thead className="sticky top-0 z-10 bg-muted text-foreground">
            <tr>
              <th className="px-2 py-2 text-left font-semibold">Účet</th>
              <th className="px-2 py-2 text-left font-semibold">Název</th>
              <th className="px-2 py-2 text-left font-semibold">Výkaz</th>
              <th className="px-2 py-2 text-left font-semibold">Řádek</th>
              <th className="px-2 py-2 text-center font-semibold">Korekce</th>
              <th className="px-2 py-2 text-right font-semibold">
                KS z deníku
              </th>
            </tr>
          </thead>
          <tbody>
            {rows.map((row) => (
              <RozvrhRow
                key={row.ucet}
                row={row}
                crVariant={crVariant}
                opravkovy={resolveOpravkovy(row.ucet, rozvrhIndex)}
                onPatch={patch}
              />
            ))}
            {rows.length === 0 ? (
              <tr>
                <td
                  colSpan={6}
                  className="px-2 py-6 text-center text-muted-foreground"
                >
                  Zatím žádné účty — načtěte deník, importujte rozvrh (CSV) nebo
                  přidejte účet ručně.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function RozvrhRow({
  row,
  crVariant,
  opravkovy,
  onPatch,
}: {
  row: Row
  crVariant: "C" | "D"
  opravkovy: boolean
  onPatch: (ucet: string, change: Partial<RozvrhAccount>) => void
}) {
  const own = row.own
  const vykaz = own?.vykaz ?? ""
  const options = vykaz === "" ? [] : leafOptions(vykaz, crVariant)
  const lawHint = row.law
    ? `${VYKAZ_NAZEV[row.law.vykaz]} — ${leafLabel(row.law.vykaz, row.law.rada, crVariant)}`
    : "nezařazeno (do výkazu nevstupuje)"

  return (
    <tr
      className={cn("border-t border-border", row.synteticky && "bg-muted/30")}
    >
      <td className="px-2 py-1.5 font-medium tabular-nums">
        {row.ucet}
        <span className="ml-1 text-[11px] text-muted-foreground">
          {row.synteticky ? "syntetický" : "analytický"}
        </span>
      </td>

      <td className="p-0">
        {row.synteticky ? (
          <span
            className="block px-2 py-1.5 text-muted-foreground"
            title="Název syntetického účtu je dán směrnou účtovou osnovou."
          >
            {row.osnova}
          </span>
        ) : (
          <input
            className={INPUT_CLASS}
            value={own?.nazev ?? ""}
            placeholder={row.osnova}
            aria-label={`Název účtu ${row.ucet}`}
            onChange={(e) => onPatch(row.ucet, { nazev: e.target.value })}
          />
        )}
      </td>

      <td className="p-0">
        {row.synteticky ? (
          <span
            className="block px-2 py-1.5 text-muted-foreground"
            title="Zařazení syntetického účtu určuje vyhláška č. 500/2002 Sb."
          >
            {lawHint}
          </span>
        ) : (
          <select
            className={INPUT_CLASS}
            value={vykaz}
            aria-label={`Výkaz účtu ${row.ucet}`}
            onChange={(e) => {
              const next = e.target.value as StatementKey | ""
              onPatch(
                row.ucet,
                next === ""
                  ? { vykaz: undefined, rada: undefined }
                  : {
                      vykaz: next,
                      rada: leafOptions(next, crVariant)[0]?.rada,
                    },
              )
            }}
          >
            <option value="">dle vyhlášky ({lawHint})</option>
            <option value="rozvaha-aktiva">Aktiva</option>
            <option value="rozvaha-pasiva">Pasiva</option>
            <option value="vzz">VZZ</option>
          </select>
        )}
      </td>

      <td className="p-0">
        {vykaz === "" ? (
          <span className="block px-2 py-1.5 text-muted-foreground">—</span>
        ) : (
          <select
            className={INPUT_CLASS}
            value={own?.rada ?? ""}
            aria-label={`Řádek účtu ${row.ucet}`}
            onChange={(e) => onPatch(row.ucet, { rada: e.target.value })}
          >
            {options.map((option) => (
              <option key={option.rada} value={option.rada}>
                {option.label}
              </option>
            ))}
          </select>
        )}
      </td>

      <td className="px-2 py-1.5 text-center">
        <input
          type="checkbox"
          checked={opravkovy}
          disabled={row.synteticky}
          aria-label={`Korekce u účtu ${row.ucet}`}
          title="Účet vstupuje do sloupce Korekce (oprávky, opravné položky)."
          onChange={(e) => onPatch(row.ucet, { opravkovy: e.target.checked })}
        />
      </td>

      <td className="px-2 py-1.5 text-right text-muted-foreground tabular-nums">
        {row.ks === null ? "—" : formatKc(row.ks)}
      </td>
    </tr>
  )
}
