"use client"

// Screen-only action bar: JSON export/import, print, rozsah + časové-rozlišení +
// hide-empty toggles, theme, reset. Marked .no-print so it never appears on the
// printed form.

import { useRef, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { ThemeToggle } from "@workspace/ui/components/theme-toggle"

import { useOrg } from "../_lib/org-context"
import { denikCsvTemplate, parseDenikCsv, parseDenikXlsx } from "../_lib/denik"
import {
  exportJson,
  importJson,
  minuleJsonTemplate,
  parseMinuleJson,
} from "../_lib/storage"
import { ROZSAH_SHORT } from "../_lib/rozsah"

export function Toolbar() {
  const {
    toDoc,
    rozsah,
    setRozsah,
    crVariant,
    setCrVariant,
    hideEmpty,
    setHideEmpty,
    loadDoc,
    reset,
    importDenik,
    importMinule,
    clearDenik,
    denikLoaded,
  } = useOrg()
  const fileInput = useRef<HTMLInputElement>(null)
  const denikInput = useRef<HTMLInputElement>(null)
  const minuleInput = useRef<HTMLInputElement>(null)
  const [minuleError, setMinuleError] = useState<string | null>(null)

  const handleImport = async (file: File | undefined) => {
    if (!file) return
    try {
      const next = await importJson(file)
      loadDoc(next)
    } catch {
      window.alert(
        "Soubor se nepodařilo načíst — očekává se export ve formátu JSON.",
      )
    }
  }

  const downloadTemplate = (
    content: string,
    filename: string,
    mime: string,
  ) => {
    const blob = new Blob([content], { type: mime })
    const url = URL.createObjectURL(blob)
    const anchor = document.createElement("a")
    anchor.href = url
    anchor.download = filename
    document.body.appendChild(anchor)
    anchor.click()
    anchor.remove()
    URL.revokeObjectURL(url)
  }

  const handleDenikImport = async (file: File | undefined) => {
    if (!file) return
    try {
      const isCsv = /\.csv$/i.test(file.name) || file.type === "text/csv"
      const result = isCsv
        ? parseDenikCsv(await file.text())
        : parseDenikXlsx(await file.arrayBuffer())
      if (!result.headerOk) {
        window.alert(
          `Deník se nepodařilo načíst — chybí povinné sloupce: ${result.missingHeaders.join(", ")}.`,
        )
        return
      }
      importDenik(result)
    } catch {
      window.alert(
        "Deník se nepodařilo načíst — očekává se účetní deník exportovaný z POHODY do XLSX.",
      )
    }
  }

  const handleMinuleImport = async (file: File | undefined) => {
    if (!file) return
    setMinuleError(null)
    try {
      importMinule(await parseMinuleJson(file))
    } catch {
      setMinuleError(
        'Soubor minulého období se nepodařilo načíst — očekává se JSON ve formátu "vykazy-minule".',
      )
    }
  }

  return (
    <div className="no-print flex flex-wrap items-center gap-2 rounded-lg border border-border bg-card p-2">
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => exportJson(toDoc())}
      >
        Export vše (JSON)
      </Button>

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => fileInput.current?.click()}
      >
        Import vše (JSON)
      </Button>
      <input
        ref={fileInput}
        type="file"
        accept="application/json,.json"
        className="hidden"
        onChange={(e) => {
          void handleImport(e.target.files?.[0])
          e.target.value = ""
        }}
      />

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => window.print()}
      >
        Tisk / PDF
      </Button>

      <span className="mx-1 h-5 w-px bg-muted" />

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => denikInput.current?.click()}
      >
        Import deník (XLSX/CSV)
      </Button>
      <input
        ref={denikInput}
        type="file"
        accept=".xlsx,.csv,text/csv,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet"
        className="hidden"
        onChange={(e) => {
          void handleDenikImport(e.target.files?.[0])
          e.target.value = ""
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() =>
          downloadTemplate(
            denikCsvTemplate(),
            "ucetni-dennik-sablona.csv",
            "text/csv;charset=utf-8",
          )
        }
      >
        Šablona deníku (CSV)
      </Button>

      {denikLoaded ? (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          onClick={() => {
            if (
              window.confirm(
                "Opravdu vymazat načtený deník a odvozené hodnoty?",
              )
            )
              clearDenik()
          }}
        >
          Vymazat deník
        </Button>
      ) : null}

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => minuleInput.current?.click()}
      >
        Import minulé (JSON)
      </Button>
      <input
        ref={minuleInput}
        type="file"
        accept=".json,application/json"
        className="hidden"
        onChange={(e) => {
          void handleMinuleImport(e.target.files?.[0])
          e.target.value = ""
        }}
      />
      {/* Blank prior-year file for the CURRENT rozsah + časové rozlišení, so the
          fillable řádky match the form on screen. */}
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() =>
          downloadTemplate(
            minuleJsonTemplate(rozsah, crVariant),
            "vykazy-minule-sablona.json",
            "application/json",
          )
        }
      >
        Šablona minulého období (JSON)
      </Button>
      {minuleError ? (
        <span className="text-xs text-destructive">{minuleError}</span>
      ) : null}

      <span className="mx-1 h-5 w-px bg-muted" />

      {/* § 3a odst. 2 vyhlášky — the zkrácený rozsah has two variants, one per
          kategorie účetní jednotky, so this cycles through all three. */}
      <Button
        type="button"
        variant={rozsah === "plny" ? "outline" : "default"}
        size="sm"
        onClick={() =>
          setRozsah(
            rozsah === "plny" ? "mala" : rozsah === "mala" ? "mikro" : "plny",
          )
        }
        title="Plný rozsah / zkrácený rozsah malé ÚJ bez auditu / zkrácený rozsah mikro ÚJ bez auditu"
      >
        Rozsah: {ROZSAH_SHORT[rozsah]}
      </Button>

      {/* § 3 odst. 3 a 4 vyhlášky — časové rozlišení sits either inside
          C.II.3./C.III. or in the separate D. položka, never both. */}
      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => setCrVariant(crVariant === "D" ? "C" : "D")}
        title="Vykazování časového rozlišení: samostatná položka D., nebo uvnitř C.II.3. / C.III."
      >
        Časové rozlišení: {crVariant === "D" ? "D." : "C.II.3. / C.III."}
      </Button>

      <Button
        type="button"
        variant={hideEmpty ? "default" : "outline"}
        size="sm"
        onClick={() => setHideEmpty(!hideEmpty)}
      >
        {hideEmpty ? "Zobrazit prázdné" : "Skrýt prázdné"}
      </Button>

      <span className="mx-1 h-5 w-px bg-muted" />

      {/* The app's own theme control — /vykazy has no app-shell header to carry
          it, and the chrome follows the theme even though the form stays paper. */}
      <ThemeToggle />

      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={() => {
          if (window.confirm("Opravdu vymazat všechna zadaná data?")) reset()
        }}
      >
        Reset
      </Button>
    </div>
  )
}
