"use client"

// The DPH module's one interactive surface, shared by all three forms. Each route
// renders it with a different `kind`; the evidence table underneath is the SAME
// data in every case, because the přiznání, the kontrolní hlášení and the souhrnné
// hlášení are three projections of one § 100 evidence — and EPO cross-checks them
// against each other.

import { useCallback, useEffect, useMemo, useRef, useState } from "react"
import Link from "next/link"

import { Button } from "@workspace/ui/components/button"
import { Input } from "@workspace/ui/components/input"
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@workspace/ui/components/table"

import { useOrg } from "../../_lib/org-context"
import {
  DPH_ASSIGNABLE_LINES,
  DPH_MANUAL_FIELDS,
} from "../../_data/dph-priznani"
import {
  blankRow,
  dphEvidenceCsvTemplate,
  dphEvidenceToCsv,
  parseDphEvidenceCsv,
  type DphEvidence,
  type DphEvidenceRow,
  type KhSekce,
} from "../_lib/dph-evidence"
import {
  getStorageMode,
  loadEvidence,
  saveEvidence,
  setStorageMode,
  wipeEvidence,
  type DphStorageMode,
} from "../_lib/dph-store"
import { kontrolniVazby, type DphOrgMeta } from "../_lib/dph-project"
import { parseDphSheet, type DphSheetIssue } from "../_lib/dph-sheet"
import { parseWorkbookSheets } from "../../_lib/denik"
import { parseRozvrhSheet } from "../../_lib/rozvrh"
import { buildDphXml, downloadXml, type DphFormKind } from "../_lib/dph-xml"

const KH_SEKCE: KhSekce[] = ["A1", "A2", "A4", "A5", "B1", "B2", "B3"]
const SH_KODY = ["", "0", "1", "2", "3"]

const TITLES: Record<DphFormKind, string> = {
  priznani: "Přiznání k DPH (DPHDP3)",
  kh: "Kontrolní hlášení (DPHKH1)",
  sh: "Souhrnné hlášení VIES (DPHSHV)",
}

function download(text: string, fileName: string, mime: string) {
  const blob = new Blob([text], { type: mime })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = fileName
  a.click()
  URL.revokeObjectURL(url)
}

export function DphModule({ kind }: { kind: DphFormKind }) {
  const { org, denik, importRozvrh } = useOrg()
  const [evidence, setEvidence] = useState<DphEvidence | null>(null)
  const [mode, setMode] = useState<DphStorageMode>("session")
  const [saveError, setSaveError] = useState<string | null>(null)
  const [result, setResult] = useState<Awaited<
    ReturnType<typeof buildDphXml>
  > | null>(null)
  const [busy, setBusy] = useState(false)
  const [sheetIssues, setSheetIssues] = useState<DphSheetIssue[]>([])
  const fileRef = useRef<HTMLInputElement>(null)
  const workbookRef = useRef<HTMLInputElement>(null)
  const nextId = useRef(0)

  // Hydrate from storage on the client only — the server has no localStorage and
  // rendering evidence during SSR would leak it into the HTML payload.
  useEffect(() => {
    setMode(getStorageMode())
    setEvidence(loadEvidence(org.rok || String(new Date().getFullYear())))
  }, [org.rok])

  const update = useCallback((next: DphEvidence) => {
    setEvidence(next)
    setResult(null)
    const saved = saveEvidence(next)
    setSaveError(
      saved.ok
        ? null
        : saved.reason === "too-large"
          ? "Evidence je příliš velká na uložení do prohlížeče. Exportujte ji do CSV."
          : saved.reason === "quota"
            ? "Úložiště prohlížeče je plné — evidence NEBYLA uložena. Exportujte ji do CSV."
            : "Prohlížeč neumožňuje ukládání dat — evidence NEBUDE po zavření stránky k dispozici.",
    )
  }, [])

  const meta: DphOrgMeta = useMemo(
    () => ({
      c_ufo: "",
      dic: org.ico ? `CZ${org.ico}` : "",
      typ_ds: "P",
      nazev: org.nazev,
      naz_obce: org.obec,
      ulice: org.sidlo,
      psc: org.psc,
    }),
    [org],
  )

  const vazby = useMemo(
    () => (evidence ? kontrolniVazby(evidence) : []),
    [evidence],
  )

  if (!evidence) {
    return <p className="text-sm text-muted-foreground">Načítám evidenci…</p>
  }

  const setRow = (id: string, patch: Partial<DphEvidenceRow>) => {
    update({
      ...evidence,
      rows: evidence.rows.map((r) => (r.id === id ? { ...r, ...patch } : r)),
    })
  }

  const addRow = (smer: DphEvidenceRow["smer"]) => {
    nextId.current += 1
    update({
      ...evidence,
      rows: [...evidence.rows, blankRow(`r${Date.now()}-${nextId.current}`, smer)], // prettier-ignore
    })
  }

  const removeRow = (id: string) =>
    update({ ...evidence, rows: evidence.rows.filter((r) => r.id !== id) })

  const onImport = async (file: File) => {
    const parsed = parseDphEvidenceCsv(await file.text())
    if (!parsed.headerOk) {
      setSaveError(
        `Import selhal — v souboru chybí sloupce: ${parsed.missingHeaders.join(", ")}.`,
      )
      return
    }
    update({ ...evidence, rows: [...evidence.rows, ...parsed.rows] })
  }

  // Read the DPH sheet out of the same workbook that holds the deník, and join
  // on (Zdroj, Číslo). The deník already loaded in the builder is the join
  // partner, so amounts come from the books rather than being typed twice.
  const onWorkbook = async (file: File) => {
    const sheets = parseWorkbookSheets(await file.arrayBuffer())

    // The same workbook usually carries the účtový rozvrh; loading it here means
    // the analytical account names and placement overrides arrive with the
    // evidence instead of needing a second, separate CSV upload.
    const rozvrh = parseRozvrhSheet(sheets)
    const notes: DphSheetIssue[] = []
    if (rozvrh.found && rozvrh.accounts.length > 0) {
      importRozvrh(rozvrh.accounts)
      notes.push({
        severity: "warning",
        message: `Z listu „Rozvrh“ načteno ${rozvrh.accounts.length} účtů.`,
      })
    }

    const parsed = parseDphSheet(sheets, denik)
    if (!parsed.found) {
      setSheetIssues([
        ...notes,
        {
          severity: "error",
          message: `Sešit nemá list „DPH“. Nalezené listy: ${sheets.names.join(", ") || "žádné"}.`,
        },
      ])
      return
    }
    setSheetIssues([...notes, ...parsed.issues])
    if (parsed.rows.length > 0) {
      update({ ...evidence, rows: parsed.rows })
    }
  }

  const generate = async () => {
    setBusy(true)
    try {
      setResult(await buildDphXml(kind, evidence, meta))
    } finally {
      setBusy(false)
    }
  }

  const errors = result?.checks?.filter((c) => c.severity === "error") ?? []
  const warnings = result?.checks?.filter((c) => c.severity === "warning") ?? []
  const canDownload = result?.ok && result.xsd?.valid && errors.length === 0

  return (
    <div className="space-y-6">
      <section className="space-y-2 rounded-md border border-border p-4">
        <h2 className="text-sm font-semibold">Zdaňovací období</h2>
        <div className="flex flex-wrap items-end gap-3">
          <Labeled label="Rok">
            <Input
              className="w-24"
              value={evidence.rok}
              onChange={(e) => update({ ...evidence, rok: e.target.value })}
            />
          </Labeled>
          {kind === "priznani" ? (
            <>
              <Labeled label="Měsíc">
                <Input
                  className="w-20"
                  value={evidence.mesic ?? ""}
                  onChange={(e) =>
                    update({ ...evidence, mesic: e.target.value || undefined })
                  }
                />
              </Labeled>
              <Labeled label="Čtvrtletí">
                <Input
                  className="w-20"
                  value={evidence.ctvrt ?? ""}
                  onChange={(e) =>
                    update({ ...evidence, ctvrt: e.target.value || undefined })
                  }
                />
              </Labeled>
            </>
          ) : null}
          {kind === "kh" ? (
            <Labeled label="Měsíc (KH je vždy měsíční, § 101e odst. 1)">
              <Input
                className="w-20"
                value={evidence.khMesic ?? evidence.mesic ?? ""}
                onChange={(e) =>
                  update({ ...evidence, khMesic: e.target.value || undefined })
                }
              />
            </Labeled>
          ) : null}
          {kind === "sh" ? (
            <>
              <Labeled label="Měsíc">
                <Input
                  className="w-20"
                  value={evidence.shMesic ?? evidence.mesic ?? ""}
                  onChange={(e) =>
                    update({
                      ...evidence,
                      shMesic: e.target.value || undefined,
                    })
                  }
                />
              </Labeled>
              <Labeled label="Čtvrtletí (jen samotné služby, § 102 odst. 6)">
                <Input
                  className="w-20"
                  value={evidence.shCtvrt ?? ""}
                  onChange={(e) =>
                    update({
                      ...evidence,
                      shCtvrt: e.target.value || undefined,
                    })
                  }
                />
              </Labeled>
            </>
          ) : null}
        </div>
      </section>

      <StorageControls
        mode={mode}
        onMode={(m) => {
          setStorageMode(m)
          setMode(m)
          saveEvidence(evidence)
        }}
        onWipe={() => {
          wipeEvidence()
          update({ ...evidence, rows: [], manual: {} })
        }}
      />

      {saveError ? (
        <p className="rounded-md border border-destructive/40 bg-destructive/10 p-3 text-sm text-destructive">
          {saveError}
        </p>
      ) : null}

      <section className="space-y-3">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="mr-auto text-sm font-semibold">
            Evidence pro účely DPH ({evidence.rows.length})
          </h2>
          <Button size="sm" variant="outline" onClick={() => addRow("vystup")}>
            + Výstup
          </Button>
          <Button size="sm" variant="outline" onClick={() => addRow("vstup")}>
            + Vstup
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => workbookRef.current?.click()}
          >
            Načíst ze sešitu
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() => fileRef.current?.click()}
          >
            Import CSV
          </Button>
          <Button
            size="sm"
            variant="outline"
            onClick={() =>
              download(
                dphEvidenceCsvTemplate(),
                "dph-evidence-vzor.csv",
                "text/csv;charset=utf-8",
              )
            }
          >
            Vzor CSV
          </Button>
          <Button
            size="sm"
            variant="outline"
            disabled={evidence.rows.length === 0}
            onClick={() =>
              download(
                dphEvidenceToCsv(evidence.rows),
                "dph-evidence.csv",
                "text/csv;charset=utf-8",
              )
            }
          >
            Export CSV
          </Button>
          <input
            ref={fileRef}
            type="file"
            accept=".csv,text/csv"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onImport(f)
              e.target.value = ""
            }}
          />
          <input
            ref={workbookRef}
            type="file"
            accept=".xlsx"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0]
              if (f) void onWorkbook(f)
              e.target.value = ""
            }}
          />
        </div>

        <div className="overflow-x-auto rounded-md border border-border">
          <Table>
            <TableHeader>
              <TableRow className="hover:bg-transparent">
                <TableHead>Směr</TableHead>
                <TableHead>DPPD</TableHead>
                <TableHead>Ev. číslo</TableHead>
                <TableHead>DIČ</TableHead>
                <TableHead>Řádek</TableHead>
                <TableHead>Sazba</TableHead>
                <TableHead className="text-right">Základ</TableHead>
                <TableHead className="text-right">Daň</TableHead>
                <TableHead>KH</TableHead>
                <TableHead>SH</TableHead>
                <TableHead />
              </TableRow>
            </TableHeader>
            <TableBody>
              {evidence.rows.map((r) => (
                <TableRow key={r.id}>
                  <TableCell>
                    <select
                      className="w-20 rounded border border-input bg-background px-1 py-1 text-sm"
                      value={r.smer}
                      onChange={(e) =>
                        setRow(r.id, {
                          smer: e.target.value as DphEvidenceRow["smer"],
                        })
                      }
                    >
                      <option value="vystup">výstup</option>
                      <option value="vstup">vstup</option>
                    </select>
                  </TableCell>
                  <TableCell>
                    <Input
                      className="w-28"
                      value={r.dppd}
                      onChange={(e) => setRow(r.id, { dppd: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      className="w-28"
                      value={r.evc}
                      onChange={(e) => setRow(r.id, { evc: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <Input
                      className="w-32"
                      value={r.dic}
                      onChange={(e) =>
                        setRow(r.id, { dic: e.target.value.toUpperCase() })
                      }
                    />
                  </TableCell>
                  <TableCell>
                    <select
                      className="w-24 rounded border border-input bg-background px-1 py-1 text-sm"
                      value={r.radek}
                      onChange={(e) => setRow(r.id, { radek: e.target.value })}
                    >
                      {DPH_ASSIGNABLE_LINES.map((l) => (
                        <option key={l.r} value={l.r}>
                          ř. {l.r}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell>
                    <select
                      className="w-16 rounded border border-input bg-background px-1 py-1 text-sm"
                      value={String(r.sazba)}
                      onChange={(e) =>
                        setRow(r.id, {
                          sazba: Number(e.target.value) as 21 | 12 | 0,
                        })
                      }
                    >
                      <option value="21">21</option>
                      <option value="12">12</option>
                      <option value="0">—</option>
                    </select>
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      className="w-28 text-right tabular-nums"
                      value={r.zaklad}
                      onChange={(e) => setRow(r.id, { zaklad: e.target.value })}
                    />
                  </TableCell>
                  <TableCell className="text-right">
                    <Input
                      className="w-28 text-right tabular-nums"
                      value={r.dan}
                      onChange={(e) => setRow(r.id, { dan: e.target.value })}
                    />
                  </TableCell>
                  <TableCell>
                    <select
                      className="w-20 rounded border border-input bg-background px-1 py-1 text-sm"
                      value={r.khSekce ?? ""}
                      onChange={(e) =>
                        setRow(r.id, {
                          khSekce: (e.target.value || undefined) as
                            KhSekce | undefined,
                        })
                      }
                    >
                      <option value="">—</option>
                      {KH_SEKCE.map((s) => (
                        <option key={s} value={s}>
                          {s}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell>
                    <select
                      className="w-16 rounded border border-input bg-background px-1 py-1 text-sm"
                      value={r.shKod ?? ""}
                      onChange={(e) =>
                        setRow(r.id, { shKod: e.target.value || undefined })
                      }
                    >
                      {SH_KODY.map((k) => (
                        <option key={k} value={k}>
                          {k === "" ? "—" : k}
                        </option>
                      ))}
                    </select>
                  </TableCell>
                  <TableCell>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => removeRow(r.id)}
                    >
                      ×
                    </Button>
                  </TableCell>
                </TableRow>
              ))}
              {evidence.rows.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={11}
                    className="p-6 text-center text-sm text-muted-foreground"
                  >
                    Zatím žádné doklady. Přidejte řádek nebo importujte CSV.
                  </TableCell>
                </TableRow>
              ) : null}
            </TableBody>
          </Table>
        </div>
      </section>

      {kind === "priznani" ? (
        <section className="space-y-3 rounded-md border border-border p-4">
          <h2 className="text-sm font-semibold">
            Doplňující údaje (koeficient a krácený odpočet)
          </h2>
          <p className="text-sm text-muted-foreground">
            Hodnoty, které nevyplývají z žádného dokladu — § 76 koeficient a
            sloupec „Krácený odpočet“. Zadávají se pod názvem atributu, který
            ponesou v XML.
          </p>
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            {DPH_MANUAL_FIELDS.map((f) => (
              <Labeled key={f.attr} label={f.label}>
                <Input
                  value={evidence.manual[f.attr] ?? ""}
                  onChange={(e) =>
                    update({
                      ...evidence,
                      manual: { ...evidence.manual, [f.attr]: e.target.value },
                    })
                  }
                />
              </Labeled>
            ))}
          </div>
        </section>
      ) : null}

      {sheetIssues.length > 0 ? (
        <section className="space-y-2 rounded-md border border-border p-4">
          <h2 className="text-sm font-semibold">
            Porovnání evidence s deníkem ({sheetIssues.length})
          </h2>
          <ul className="space-y-1 text-sm">
            {sheetIssues.map((i, n) => (
              <li
                key={`${i.severity}-${n}`}
                className={
                  i.severity === "error"
                    ? "text-destructive"
                    : "text-amber-600"
                }
              >
                {i.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <section className="space-y-2 rounded-md border border-border p-4">
        <h2 className="text-sm font-semibold">Kontrolní vazby</h2>
        <p className="text-sm text-muted-foreground">
          Vazby, které kontroluje i finanční správa. Nesouhlasí-li některá,
          podání spolu nesedí a přijde výzva.
        </p>
        <ul className="space-y-1 text-sm">
          {vazby.map((v) => (
            <li key={v.label} className="flex items-baseline gap-2">
              <span className={v.ok ? "text-emerald-600" : "text-destructive"}>
                {v.ok ? "✓" : "✕"}
              </span>
              <span className="text-foreground">{v.label}</span>
              <span className="ml-auto text-muted-foreground tabular-nums">
                {v.left} / {v.right}
              </span>
            </li>
          ))}
        </ul>
      </section>

      <section className="space-y-3 rounded-md border border-border p-4">
        <div className="flex items-center gap-3">
          <Button onClick={() => void generate()} disabled={busy}>
            {busy ? "Generuji…" : `Vytvořit XML — ${TITLES[kind]}`}
          </Button>
          {canDownload && result?.xml && result.fileName ? (
            <Button
              variant="outline"
              onClick={() => downloadXml(result.xml!, result.fileName!)}
            >
              Stáhnout {result.fileName}
            </Button>
          ) : null}
        </div>

        {result && !result.ok ? (
          <p className="text-sm text-destructive">{result.error}</p>
        ) : null}

        {result?.xsd ? (
          <p
            className={
              result.xsd.valid
                ? "text-sm text-emerald-600"
                : "text-sm text-destructive"
            }
          >
            {result.xsd.valid
              ? "XML odpovídá oficiálnímu XSD schématu finanční správy."
              : `XML neodpovídá schématu: ${result.xsd.errors.slice(0, 3).join(" · ")}`}
          </p>
        ) : null}

        {errors.length > 0 ? (
          <ul className="space-y-1 text-sm text-destructive">
            {errors.map((c, i) => (
              <li key={`${c.code}-${i}`}>{c.message}</li>
            ))}
          </ul>
        ) : null}
        {warnings.length > 0 ? (
          <ul className="space-y-1 text-sm text-amber-600">
            {warnings.map((c, i) => (
              <li key={`${c.code}-${i}`}>{c.message}</li>
            ))}
          </ul>
        ) : null}
      </section>

      <p className="text-sm text-muted-foreground">
        XML se vytváří i kontroluje přímo ve vašem prohlížeči — evidence ani DIČ
        protistran se nikam neodesílají. Soubor podáte sami na{" "}
        <Link
          href="https://adisspr.mfcr.cz/pmd/epo"
          className="text-primary hover:underline"
        >
          daňovém portálu
        </Link>
        .
      </p>
    </div>
  )
}

function Labeled({
  label,
  children,
}: {
  label: string
  children: React.ReactNode
}) {
  return (
    <label className="flex flex-col gap-1 text-sm">
      <span className="text-muted-foreground">{label}</span>
      {children}
    </label>
  )
}

function StorageControls({
  mode,
  onMode,
  onWipe,
}: {
  mode: DphStorageMode
  onMode: (m: DphStorageMode) => void
  onWipe: () => void
}) {
  return (
    <section className="space-y-2 rounded-md border border-amber-500/40 bg-amber-500/5 p-4">
      <h2 className="text-sm font-semibold">Uložení evidence</h2>
      <p className="text-sm text-muted-foreground">
        Evidence obsahuje DIČ protistran. U fyzické osoby je DIČ rodné číslo,
        proto se ve výchozím nastavení uchovává jen do zavření karty prohlížeče.
        Na sdíleném počítači trvalé uložení nezapínejte.
      </p>
      <div className="flex flex-wrap items-center gap-4">
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            checked={mode === "session"}
            onChange={() => onMode("session")}
          />
          Jen do zavření karty
        </label>
        <label className="flex items-center gap-2 text-sm">
          <input
            type="radio"
            checked={mode === "local"}
            onChange={() => onMode("local")}
          />
          Uchovat v tomto prohlížeči
        </label>
        <Button size="sm" variant="outline" onClick={onWipe}>
          Smazat evidenci
        </Button>
      </div>
    </section>
  )
}
