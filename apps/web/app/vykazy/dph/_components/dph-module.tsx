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
import { FINANCNI_URADY } from "../../_data/ufo"
import {
  blankRow,
  dphEvidenceCsvTemplate,
  dphEvidenceToCsv,
  parseDphEvidenceCsv,
  blankCallOffRow,
  type DphCallOffRow,
  type DphEvidence,
  type DphEvidenceRow,
  type DphSazba,
  type KhSekce,
} from "../_lib/dph-evidence"
import {
  getStorageMode,
  loadEvidence,
  saveEvidence,
  switchStorageMode,
  wipeEvidence,
  type DphStorageMode,
} from "../_lib/dph-store"
import {
  evidenceIssues,
  kontrolniVazby,
  type DphOrgMeta,
} from "../_lib/dph-project"
import { parseDphSheet, type DphSheetIssue } from "../_lib/dph-sheet"
import { parseWorkbookSheets } from "../../_lib/denik"
import { parseRozvrhSheet } from "../../_lib/rozvrh"
import { buildDphXml, downloadXml, type DphFormKind } from "../_lib/dph-xml"

const KH_SEKCE: KhSekce[] = ["A1", "A2", "A4", "A5", "B1", "B2", "B3"]

/**
 * Druh podání per form. The three alphabets do NOT overlap and mean different
 * things — a DPHDP3 "D" is dodatečné, a DPHKH1 "N" is následné, and the souhrnné
 * hlášení has no opravné form at all: a correction there is a následné hlášení
 * carrying storno rows.
 */
const FORMY: Record<DphFormKind, { value: string; label: string }[]> = {
  priznani: [
    { value: "B", label: "Řádné" },
    { value: "O", label: "Opravné (§ 138 DŘ — před uplynutím lhůty)" },
    { value: "D", label: "Dodatečné (§ 141 DŘ)" },
    { value: "E", label: "Opravné dodatečné" },
  ],
  kh: [
    { value: "B", label: "Řádné (§ 101e)" },
    { value: "O", label: "Řádné/opravné (§ 101f odst. 1)" },
    { value: "N", label: "Následné (§ 101f odst. 2)" },
  ],
  sh: [
    { value: "R", label: "Řádné" },
    { value: "N", label: "Následné (opravuje se storno řádky)" },
  ],
}
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
    // Import findings describe the evidence AS IMPORTED. Once a row is edited
    // they are stale, and they gate the download — keeping them would lock the
    // user out of a filing they have just corrected.
    setSheetIssues([])
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

  // c_ufo, dic and typ_ds are `use="required"` on VetaP of all three forms, and
  // the envelope drops an empty attribute rather than emitting `attr=""`, so a
  // blank here is not a cosmetic gap — the document fails XSD validation and can
  // never be downloaded. None of the three is derivable: the finanční úřad is a
  // choice, and a fyzická osoba's DIČ is a rodné číslo, not CZ + IČO.
  const meta: DphOrgMeta = useMemo(
    () => ({
      c_ufo: evidence?.cUfo ?? "",
      dic: evidence?.dic ?? (org.ico ? `CZ${org.ico}` : ""),
      typ_ds: evidence?.typDs ?? "P",
      nazev: org.nazev,
      naz_obce: org.obec,
      ulice: org.sidlo,
      psc: org.psc,
    }),
    [org, evidence],
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

  const setCallOff = (id: string, patch: Partial<DphCallOffRow>) => {
    update({
      ...evidence,
      callOff: (evidence.callOff ?? []).map((r) =>
        r.id === id ? { ...r, ...patch } : r,
      ),
    })
  }

  const addCallOff = () => {
    nextId.current += 1
    update({
      ...evidence,
      callOff: [
        ...(evidence.callOff ?? []),
        blankCallOffRow(`cos${Date.now()}-${nextId.current}`),
      ],
    })
  }

  const removeCallOff = (id: string) =>
    update({
      ...evidence,
      callOff: (evidence.callOff ?? []).filter((r) => r.id !== id),
    })

  const onImport = async (file: File) => {
    nextId.current += 1
    // A fresh id namespace per import: the rows are APPENDED, so a parse-local
    // index would regenerate ids the evidence already holds and two unrelated
    // dokladu would then edit and delete as one.
    const parsed = parseDphEvidenceCsv(
      await file.text(),
      `csv${nextId.current}`,
    )
    if (!parsed.headerOk) {
      setSaveError(
        `Import selhal — v souboru chybí sloupce: ${parsed.missingHeaders.join(", ")}.`,
      )
      return
    }
    update({ ...evidence, rows: [...evidence.rows, ...parsed.rows] })
    // Rows the parser refused, and columns it did not recognise, are reported
    // rather than dropped: a silently skipped row is a plnění missing from the
    // přiznání, and a misspelt header is a column filed as zero.
    setSheetIssues([
      ...parsed.skipped.map((message) => ({
        severity: "error" as const,
        message,
      })),
      ...(parsed.ignoredColumns.length > 0
        ? [
            {
              severity: "warning" as const,
              message: `Nerozpoznané sloupce (ignorovány): ${parsed.ignoredColumns.join(", ")}.`,
            },
          ]
        : []),
    ])
  }

  // Read the DPH sheet out of the same workbook that holds the deník, and join
  // on (Zdroj, Číslo). The deník already loaded in the builder is the join
  // partner, so amounts come from the books rather than being typed twice.
  const onWorkbook = async (file: File) => {
    const sheets = parseWorkbookSheets(await file.arrayBuffer())
    if (!sheets.ok) {
      setSheetIssues([
        {
          severity: "error",
          message:
            "Soubor se nepodařilo rozbalit — není to platný XLSX. Přejmenovaný .xls nestačí, uložte sešit znovu jako .xlsx.",
        },
      ])
      return
    }
    // Without the deník there is nothing to join to, and every row would inherit
    // a zero — a whole filing understated to nothing, silently.
    if (denik.length === 0) {
      setSheetIssues([
        {
          severity: "error",
          message:
            "Nejprve načtěte účetní deník. Bez něj se k dokladům nedají doplnit částky a evidence by zůstala nulová.",
        },
      ])
      return
    }

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
    // `update` clears the issue list, so the rows go in FIRST and the findings
    // for those exact rows are set after.
    if (parsed.rows.length > 0) {
      update({ ...evidence, rows: parsed.rows })
    }
    setSheetIssues([...notes, ...parsed.issues])
  }

  // Faults no XSD can catch, read from the CURRENT evidence so correcting a row
  // clears them. Nearly every EPO attribute is `use="optional"` and an empty one
  // is omitted rather than emitted, so a document missing a mandatory value
  // validates cleanly and is rejected on upload.
  const forma =
    kind === "priznani"
      ? (evidence.forma ?? "B")
      : kind === "kh"
        ? (evidence.khForma ?? "B")
        : (evidence.shForma ?? "R")
  // Datum zjištění is required on a dodatečné přiznání (D/E) and on a následné
  // kontrolní hlášení (N); the souhrnné hlášení has no such field.
  const needsZjist =
    (kind === "priznani" && (forma === "D" || forma === "E")) ||
    (kind === "kh" && forma === "N")

  const preflight = evidenceIssues(evidence, meta)
  if (needsZjist && (evidence.dZjist ?? "") === "") {
    preflight.push("Vyplňte datum zjištění důvodů — na tomto druhu podání je povinné.") // prettier-ignore
  }
  const importErrors = sheetIssues.filter((i) => i.severity === "error")

  const generate = async () => {
    if (preflight.length > 0) return
    setBusy(true)
    try {
      setResult(await buildDphXml(kind, evidence, meta))
    } finally {
      setBusy(false)
    }
  }

  const errors = result?.checks?.filter((c) => c.severity === "error") ?? []
  const warnings = result?.checks?.filter((c) => c.severity === "warning") ?? []
  const canDownload =
    result?.ok &&
    result.xsd?.valid &&
    errors.length === 0 &&
    preflight.length === 0 &&
    importErrors.length === 0

  return (
    <div className="space-y-6">
      <section className="space-y-3 rounded-md border border-border p-4">
        <h2 className="text-sm font-semibold">Podání</h2>
        <p className="text-sm text-muted-foreground">
          Finanční úřad, DIČ a typ subjektu jsou na všech třech formulářích
          povinné. Bez nich podání neprojde kontrolou schématu.
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <Labeled label="Finanční úřad">
            <select
              className="w-72 rounded border border-input bg-background px-2 py-1 text-sm"
              value={evidence.cUfo ?? ""}
              onChange={(e) =>
                update({ ...evidence, cUfo: e.target.value || undefined })
              }
            >
              <option value="">— vyberte —</option>
              {FINANCNI_URADY.map((u) => (
                <option key={u.kod} value={u.kod}>
                  {u.nazev}
                </option>
              ))}
            </select>
          </Labeled>
          <Labeled label="DIČ plátce">
            <Input
              className="w-40"
              value={evidence.dic ?? (org.ico ? `CZ${org.ico}` : "")}
              onChange={(e) =>
                update({
                  ...evidence,
                  dic: e.target.value.toUpperCase() || undefined,
                })
              }
            />
          </Labeled>
          <Labeled label="Typ subjektu">
            <select
              className="w-44 rounded border border-input bg-background px-2 py-1 text-sm"
              value={evidence.typDs ?? "P"}
              onChange={(e) =>
                update({
                  ...evidence,
                  typDs: e.target.value === "F" ? "F" : "P",
                })
              }
            >
              <option value="P">Právnická osoba</option>
              <option value="F">Fyzická osoba</option>
            </select>
          </Labeled>
          <Labeled label="Druh podání">
            <select
              className="w-72 rounded border border-input bg-background px-2 py-1 text-sm"
              value={forma}
              onChange={(e) =>
                update({
                  ...evidence,
                  ...(kind === "priznani"
                    ? { forma: e.target.value }
                    : kind === "kh"
                      ? { khForma: e.target.value }
                      : { shForma: e.target.value }),
                })
              }
            >
              {FORMY[kind].map((f) => (
                <option key={f.value} value={f.value}>
                  {f.label}
                </option>
              ))}
            </select>
          </Labeled>
          {needsZjist ? (
            <Labeled label="Datum zjištění důvodů">
              <Input
                className="w-32"
                placeholder="15.6.2026"
                value={evidence.dZjist ?? ""}
                onChange={(e) =>
                  update({ ...evidence, dZjist: e.target.value || undefined })
                }
              />
            </Labeled>
          ) : null}
          {kind === "kh" ? (
            <>
              <Labeled label="Č. j. výzvy (nepovinné)">
                <Input
                  className="w-44"
                  value={evidence.cJedVyzvy ?? ""}
                  onChange={(e) =>
                    update({
                      ...evidence,
                      cJedVyzvy: e.target.value || undefined,
                    })
                  }
                />
              </Labeled>
              {evidence.cJedVyzvy ? (
                <Labeled label="Odpověď na výzvu">
                  <select
                    className="w-64 rounded border border-input bg-background px-2 py-1 text-sm"
                    value={evidence.vyzvaOdp ?? ""}
                    onChange={(e) =>
                      update({
                        ...evidence,
                        vyzvaOdp: e.target.value || undefined,
                      })
                    }
                  >
                    <option value="">—</option>
                    <option value="P">Potvrzuji správnost naposledy podaného KH</option>
                    <option value="N">Podávám následné KH</option>
                  </select>
                </Labeled>
              ) : null}
            </>
          ) : null}
        </div>
      </section>

      <section className="space-y-3 rounded-md border border-border p-4">
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
            <Obdobi
              choice={evidence.obdobi ?? (evidence.ctvrt ? "ctvrt" : "mesic")}
              mesic={evidence.mesic ?? ""}
              ctvrt={evidence.ctvrt ?? ""}
              onChoice={(obdobi) => update({ ...evidence, obdobi })}
              onMesic={(mesic) =>
                update({ ...evidence, mesic: mesic || undefined })
              }
              onCtvrt={(ctvrt) =>
                update({ ...evidence, ctvrt: ctvrt || undefined })
              }
              note="Přiznání nese buď měsíc, nebo čtvrtletí — nikdy obojí."
            />
          ) : null}
          {kind === "kh" ? (
            <Obdobi
              choice={
                evidence.khObdobi ??
                (evidence.typDs === "F" && evidence.ctvrt ? "ctvrt" : "mesic")
              }
              mesic={evidence.khMesic ?? evidence.mesic ?? ""}
              ctvrt={evidence.khCtvrt ?? evidence.ctvrt ?? ""}
              onChoice={(khObdobi) => update({ ...evidence, khObdobi })}
              onMesic={(khMesic) =>
                update({ ...evidence, khMesic: khMesic || undefined })
              }
              onCtvrt={(khCtvrt) =>
                update({ ...evidence, khCtvrt: khCtvrt || undefined })
              }
              note="Měsíční pro právnickou osobu (§ 101e odst. 1); čtvrtletní jen pro fyzickou osobu se čtvrtletním zdaňovacím obdobím (odst. 2)."
            />
          ) : null}
          {kind === "sh" ? (
            <Obdobi
              choice={evidence.shObdobi ?? (evidence.shCtvrt ? "ctvrt" : "mesic")} // prettier-ignore
              mesic={evidence.shMesic ?? evidence.mesic ?? ""}
              ctvrt={evidence.shCtvrt ?? evidence.ctvrt ?? ""}
              onChoice={(shObdobi) => update({ ...evidence, shObdobi })}
              onMesic={(shMesic) =>
                update({ ...evidence, shMesic: shMesic || undefined })
              }
              onCtvrt={(shCtvrt) =>
                update({ ...evidence, shCtvrt: shCtvrt || undefined })
              }
              note="Čtvrtletní jen u plátce dodávajícího samotné služby podle § 9 odst. 1 (§ 102 odst. 6)."
            />
          ) : null}
        </div>
      </section>

      <StorageControls
        mode={mode}
        onMode={(m) => {
          // One step, so the evidence never stays behind in the store being
          // switched away from — a DIČ left in localStorage outlives the tab.
          switchStorageMode(m, evidence)
          setMode(m)
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
                {kind === "sh" && forma === "N" ? (
                  <TableHead title="Storno řádek následného hlášení">
                    Storno
                  </TableHead>
                ) : null}
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
                      className="w-20 rounded border border-input bg-background px-1 py-1 text-sm"
                      value={String(r.sazba)}
                      onChange={(e) =>
                        setRow(r.id, {
                          sazba: Number(e.target.value) as DphSazba,
                        })
                      }
                    >
                      <option value="21">21</option>
                      <option value="12">12</option>
                      {/* Retired 31.12.2023; kept for an oprava of an older
                          doklad, which must carry the rate that applied then. */}
                      <option value="15">15 †</option>
                      <option value="10">10 †</option>
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
                  {kind === "sh" && forma === "N" ? (
                    <TableCell>
                      <input
                        type="checkbox"
                        aria-label="Storno řádek"
                        checked={r.shStorno === true}
                        onChange={(e) =>
                          setRow(r.id, {
                            shStorno: e.target.checked ? true : undefined,
                          })
                        }
                      />
                    </TableCell>
                  ) : null}
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
                    colSpan={kind === "sh" && forma === "N" ? 12 : 11}
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
                  i.severity === "error" ? "text-destructive" : "text-amber-600"
                }
              >
                {i.message}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      {kind === "sh" ? (
        <section className="space-y-3 rounded-md border border-border p-4">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="mr-auto text-sm font-semibold">
              Režim skladu (call-off stock, § 18) — {(evidence.callOff ?? []).length}
            </h2>
            <Button size="sm" variant="outline" onClick={addCallOff}>
              + Záznam
            </Button>
          </div>
          <p className="text-sm text-muted-foreground">
            Samostatná povinnost podávaná na témže souhrnném hlášení. Nenese
            hodnotu plnění ani kód plnění — jen pořizovatele a to, co se se
            zbožím stalo.
          </p>
          {(evidence.callOff ?? []).length > 0 ? (
            <div className="overflow-x-auto rounded-md border border-border">
              <Table>
                <TableHeader>
                  <TableRow className="hover:bg-transparent">
                    <TableHead>DIČ pořizovatele</TableHead>
                    <TableHead>Kód</TableHead>
                    <TableHead>Původní DIČ (jen u kódu 3)</TableHead>
                    <TableHead />
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {(evidence.callOff ?? []).map((r) => (
                    <TableRow key={r.id}>
                      <TableCell>
                        <Input
                          className="w-40"
                          value={r.dic}
                          onChange={(e) =>
                            setCallOff(r.id, {
                              dic: e.target.value.toUpperCase(),
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <select
                          className="w-72 rounded border border-input bg-background px-1 py-1 text-sm"
                          value={r.kod}
                          onChange={(e) =>
                            setCallOff(r.id, { kod: e.target.value })
                          }
                        >
                          <option value="1">1 — přeprava zboží do skladu</option>
                          <option value="2">2 — vrácení zboží nebo oprava chyby</option>
                          <option value="3">3 — změna předpokládaného pořizovatele</option>
                        </select>
                      </TableCell>
                      <TableCell>
                        <Input
                          className="w-40"
                          disabled={r.kod !== "3"}
                          value={r.dicPuvodni ?? ""}
                          onChange={(e) =>
                            setCallOff(r.id, {
                              dicPuvodni: e.target.value.toUpperCase() || undefined, // prettier-ignore
                            })
                          }
                        />
                      </TableCell>
                      <TableCell>
                        <Button
                          size="sm"
                          variant="ghost"
                          onClick={() => removeCallOff(r.id)}
                        >
                          ×
                        </Button>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          ) : null}
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
        {preflight.length > 0 ? (
          <div className="space-y-1 rounded-md border border-destructive/40 bg-destructive/10 p-3">
            <p className="text-sm font-medium text-destructive">
              Doplňte, než podání vytvoříte:
            </p>
            <ul className="space-y-1 text-sm text-destructive">
              {preflight.slice(0, 12).map((m, i) => (
                <li key={`${i}-${m}`}>{m}</li>
              ))}
              {preflight.length > 12 ? (
                <li>… a další ({preflight.length - 12}).</li>
              ) : null}
            </ul>
          </div>
        ) : null}

        <div className="flex items-center gap-3">
          <Button
            onClick={() => void generate()}
            disabled={busy || preflight.length > 0}
          >
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

/**
 * Měsíc OR čtvrtletí, never both. Two free inputs let a filer leave the other
 * one filled, and every EPO form rejects a document carrying both periods while
 * its XSD marks them optional and validates it cleanly.
 */
function Obdobi({
  choice,
  mesic,
  ctvrt,
  onChoice,
  onMesic,
  onCtvrt,
  note,
}: {
  choice: "mesic" | "ctvrt"
  mesic: string
  ctvrt: string
  onChoice: (c: "mesic" | "ctvrt") => void
  onMesic: (v: string) => void
  onCtvrt: (v: string) => void
  note: string
}) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Labeled label="Období">
        <select
          className="w-32 rounded border border-input bg-background px-2 py-1 text-sm"
          value={choice}
          onChange={(e) =>
            onChoice(e.target.value === "ctvrt" ? "ctvrt" : "mesic")
          }
        >
          <option value="mesic">Měsíční</option>
          <option value="ctvrt">Čtvrtletní</option>
        </select>
      </Labeled>
      {choice === "mesic" ? (
        <Labeled label="Měsíc">
          <Input
            className="w-20"
            value={mesic}
            onChange={(e) => onMesic(e.target.value)}
          />
        </Labeled>
      ) : (
        <Labeled label="Čtvrtletí">
          <Input
            className="w-20"
            value={ctvrt}
            onChange={(e) => onCtvrt(e.target.value)}
          />
        </Labeled>
      )}
      <p className="max-w-md text-xs text-muted-foreground">{note}</p>
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
