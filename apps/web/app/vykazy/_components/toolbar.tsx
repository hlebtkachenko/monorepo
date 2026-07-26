"use client"

// Screen-only action bar: JSON export/import, print, rozsah + časové-rozlišení +
// hide-empty toggles, theme, reset. Marked .no-print so it never appears on the
// printed form.

import { useRef, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { ThemeToggle } from "@workspace/ui/components/theme-toggle"
import { cn } from "@workspace/ui/lib/utils"

import { useOrg } from "../_lib/org-context"
import { denikCsvTemplate, parseDenikCsv, parseDenikXlsx } from "../_lib/denik"
import { parseRozvrhCsv, rozvrhCsvTemplate } from "../_lib/rozvrh"
import { exportJson, importJson, parseMinuleJson } from "../_lib/storage"
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
    importRozvrh,
    clearRozvrh,
    clearDenik,
    denikLoaded,
    rozvrh,
  } = useOrg()
  const fileInput = useRef<HTMLInputElement>(null)
  const denikInput = useRef<HTMLInputElement>(null)
  const minuleInput = useRef<HTMLInputElement>(null)
  const rozvrhInput = useRef<HTMLInputElement>(null)
  const [minuleError, setMinuleError] = useState<string | null>(null)
  // `warn` separates "loaded, but rows were dropped" from a clean load, so a
  // successful import is not dressed in the same amber as a partial one.
  const [rozvrhNote, setRozvrhNote] = useState<{
    text: string
    warn: boolean
  } | null>(null)

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

  const downloadCsv = (content: string, filename: string) => {
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

  const downloadDenikTemplate = () => {
    downloadCsv(denikCsvTemplate(), "ucetni-dennik-sablona.csv")
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

  const downloadRozvrhTemplate = () => {
    downloadCsv(rozvrhCsvTemplate(), "uctovy-rozvrh-sablona.csv")
  }

  const handleRozvrhImport = async (file: File | undefined) => {
    if (!file) return
    setRozvrhNote(null)
    let result: ReturnType<typeof parseRozvrhCsv>
    try {
      result = parseRozvrhCsv(await file.text())
    } catch {
      window.alert("Soubor se nepodařilo přečíst.")
      return
    }
    if (!result.headerOk) {
      // A chart saved from Excel as "CSV (Windows)" is cp1250, and every accented
      // header then arrives mangled — the columns look present but match nothing.
      window.alert(
        `Účtový rozvrh se nepodařilo načíst — chybí povinné sloupce: ${result.missingHeaders.join(", ")}.` +
          " Pokud sloupce v souboru jsou, uložte jej v kódování UTF-8.",
      )
      return
    }
    if (result.accounts.length === 0) {
      window.alert("Účtový rozvrh neobsahuje žádný účet.")
      return
    }
    // Applying the chart re-maps an already-loaded deník. A throw in there used
    // to end the click with nothing on screen and only a console entry, which is
    // indistinguishable from the file dialog having done nothing at all.
    try {
      importRozvrh(result.accounts)
    } catch (error) {
      console.error("[vykazy] importRozvrh failed", error)
      window.alert(
        "Účtový rozvrh se načetl, ale nepodařilo se jej použít na deník." +
          " Zkuste deník načíst znovu; podrobnosti jsou v konzoli prohlížeče.",
      )
      return
    }
    // Every drop the parser makes is reported. Silence here used to mean a
    // mistyped header, a nameless account or a duplicate vanished unnoticed.
    // A clean import says so too: without it a successful load looked like a
    // dead button on any page that does not render the rozvrh table.
    const notes = [
      ...result.skipped,
      ...result.duplicates,
      ...(result.ignoredColumns.length > 0
        ? [`nezpracované sloupce: ${result.ignoredColumns.join(", ")}`]
        : []),
    ]
    setRozvrhNote({
      text:
        notes.length > 0
          ? `Načteno ${result.accounts.length} účtů. Přeskočeno — ${notes.join("; ")}.`
          : `Načteno ${result.accounts.length} účtů.`,
      warn: notes.length > 0,
    })
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
        onClick={downloadDenikTemplate}
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
      {minuleError ? (
        <span className="text-xs text-destructive">{minuleError}</span>
      ) : null}

      <span className="mx-1 h-5 w-px bg-muted" />

      <Button
        type="button"
        variant="outline"
        size="sm"
        onClick={() => rozvrhInput.current?.click()}
      >
        Import rozvrh (CSV)
      </Button>
      <input
        ref={rozvrhInput}
        type="file"
        accept=".csv,text/csv"
        className="hidden"
        onChange={(e) => {
          void handleRozvrhImport(e.target.files?.[0])
          e.target.value = ""
        }}
      />
      <Button
        type="button"
        variant="ghost"
        size="sm"
        onClick={downloadRozvrhTemplate}
      >
        Šablona rozvrhu (CSV)
      </Button>
      {rozvrh.length > 0 ? (
        <>
          <span className="text-xs text-muted-foreground">
            Rozvrh: {rozvrh.length} účtů
          </span>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            onClick={() => {
              if (window.confirm("Opravdu vymazat načtený účtový rozvrh?")) {
                clearRozvrh()
                setRozvrhNote(null)
              }
            }}
          >
            Vymazat rozvrh
          </Button>
        </>
      ) : null}
      {rozvrhNote ? (
        <span
          className={cn(
            "text-xs",
            rozvrhNote.warn
              ? "text-amber-600 dark:text-amber-400"
              : "text-green-600 dark:text-green-400",
          )}
        >
          {rozvrhNote.text}
        </span>
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
