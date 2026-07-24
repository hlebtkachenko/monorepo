"use client"

// DPPO (DPPDP9) generator — the interactive client piece of /vykazy/dppo.
// Reads org identity + the obratová předvaha from the shared /vykazy context,
// prefills the účetní výsledek (ř.10) from the deník, collects the daňové úpravy
// (§23–§35) the books cannot produce, and posts figures + meta to the server
// action, which serializes + XSD-validates. Download is gated on XSD validity.

import { useMemo, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { useOrg } from "../../_lib/org-context"
import { FINANCNI_URADY } from "../../_data/ufo"
import { buildDppoXml, type DppoActionResult } from "../_lib/dppo-action"
import {
  deriveUcetniVysledek,
  defaultSazba,
  filingYear,
  applyFieldChange,
  toFigures,
  toMeta,
  missingRequired,
  type DppoFormState,
} from "../_lib/dppo-bridge"

const INPUT_CLASS =
  "rounded border border-neutral-300 bg-white px-2 py-1.5 text-sm text-black outline-none focus:border-blue-400 focus:ring-1 focus:ring-blue-400"

function initForm(ico: string, rok: string, ucetni: string): DppoFormState {
  const zdobdOd = rok ? `1.1.${rok}` : ""
  const zdobdDo = rok ? `31.12.${rok}` : ""
  return {
    dic: ico ? `CZ${ico}` : "",
    cUfoCil: "",
    cNace: "",
    typPopldpp: "1",
    zdobdOd,
    zdobdDo,
    ucetniVysledek: ucetni,
    nedanoveNaklady: "",
    odpisyUcetniNadDanove: "",
    osvobozeneVynosy: "",
    odpisyDanoveNadUcetni: "",
    odpocetZtraty: "",
    slevy: "",
    sazba: defaultSazba(zdobdOd),
    excludeLoss: "",
  }
}

function downloadXml(xml: string, name: string): void {
  const blob = new Blob([xml], { type: "application/xml;charset=utf-8" })
  const url = URL.createObjectURL(blob)
  const a = document.createElement("a")
  a.href = url
  a.download = name
  document.body.appendChild(a)
  a.click()
  a.remove()
  URL.revokeObjectURL(url)
}

interface TextFieldProps {
  label: string
  value: string
  onChange: (v: string) => void
  placeholder?: string
  numeric?: boolean
  className?: string
  hint?: string
}

function TextField({
  label,
  value,
  onChange,
  placeholder,
  numeric,
  className,
  hint,
}: TextFieldProps) {
  return (
    <label className={cn("flex flex-col gap-1", className)}>
      <span className="text-xs font-medium text-neutral-600">{label}</span>
      <input
        type="text"
        inputMode={numeric ? "numeric" : undefined}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(INPUT_CLASS, numeric && "text-right tabular-nums")}
      />
      {hint ? <span className="text-xs text-neutral-500">{hint}</span> : null}
    </label>
  )
}

export function DppoForm() {
  const { org, predvaha } = useOrg()
  const derived = useMemo(() => deriveUcetniVysledek(predvaha), [predvaha])
  const hasDenik = predvaha.ucty.length > 0

  const [form, setForm] = useState<DppoFormState>(() =>
    initForm(org.ico, org.rok, derived),
  )
  const [result, setResult] = useState<DppoActionResult | null>(null)
  const [busy, setBusy] = useState(false)

  const set = (key: keyof DppoFormState, value: string) => {
    setForm((f) => applyFieldChange(f, key, value))
    setResult(null)
  }

  const missing = missingRequired(form)
  const canGenerate = missing.length === 0 && !busy
  const year = filingYear(form.zdobdOd)
  const periodOutOfRange = year !== null && year > 2025
  const zeroResult = !form.ucetniVysledek.trim() || form.ucetniVysledek === "0"

  const generate = async () => {
    setBusy(true)
    setResult(null)
    const res = await buildDppoXml(toFigures(form), toMeta(form, org))
    setResult(res)
    setBusy(false)
  }

  return (
    <div className="space-y-5">
      <p className="rounded-lg border border-blue-200 bg-blue-50 p-3 text-sm text-neutral-700">
        Účetní výsledek hospodaření (ř.10) se převezme z nahraného deníku.
        Daňové úpravy (§23–§35) doplňte ručně — deník je neobsahuje. Nástroj
        vytvoří XML pro ruční odeslání přes EPO;{" "}
        <strong>nepodává ani nepodepisuje</strong> přiznání a přiznává daňovou
        povinnost (ne doplatek).
      </p>

      {!hasDenik ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800">
          Nenačten žádný účetní deník. Účetní výsledek zadejte ručně, nebo jej
          nahrajte na stránce <em>Účetní deník</em> a vraťte se sem.
        </p>
      ) : null}

      <section className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
        <h2 className="mb-3 text-sm font-semibold text-neutral-700">
          Identifikace a období
        </h2>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <TextField
            label="DIČ"
            value={form.dic}
            onChange={(v) => set("dic", v)}
            placeholder="CZ12345678"
          />
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-600">
              Finanční úřad
            </span>
            <select
              value={form.cUfoCil}
              onChange={(e) => set("cUfoCil", e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="">— vyberte —</option>
              {FINANCNI_URADY.map((u) => (
                <option key={u.kod} value={u.kod}>
                  {u.nazev}
                </option>
              ))}
            </select>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-neutral-600">
              Typ poplatníka
            </span>
            <select
              value={form.typPopldpp}
              onChange={(e) => set("typPopldpp", e.target.value)}
              className={INPUT_CLASS}
            >
              <option value="1">1 — ostatní</option>
              <option value="3">3 — veřejně prospěšný poplatník</option>
            </select>
          </label>
          <TextField
            label="Zdaňovací období od"
            value={form.zdobdOd}
            onChange={(v) => set("zdobdOd", v)}
            placeholder="1.1.2025"
          />
          <TextField
            label="Zdaňovací období do"
            value={form.zdobdDo}
            onChange={(v) => set("zdobdDo", v)}
            placeholder="31.12.2025"
          />
          <TextField
            label="Kód CZ-NACE (nepovinné)"
            value={form.cNace}
            onChange={(v) => set("cNace", v)}
            placeholder="620200"
            numeric
            hint="Číselný kód převažující činnosti."
          />
        </div>
      </section>

      <section className="rounded-lg border border-neutral-200 bg-neutral-50 p-4">
        <h2 className="mb-1 text-sm font-semibold text-neutral-700">
          Daňová část (II. oddíl)
        </h2>
        <p className="mb-3 text-xs text-neutral-500">
          Zjednodušený souhrn: ostatní úpravy se knihují na obecné řádky (ř.40 /
          ř.110). Daň i základ vyjdou správně, ale přiznání není řádek po řádku
          úplné — Přílohu č. 1 (Tabulky A/E/G/H k ř. 40/230/300) a případnou
          přílohu k ř.62 dokončete v EPO.
        </p>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <div className="flex flex-col gap-1">
            <TextField
              label="ř.10 Výsledek hospodaření před zdaněním"
              value={form.ucetniVysledek}
              onChange={(v) => set("ucetniVysledek", v)}
              numeric
            />
            {hasDenik ? (
              <button
                type="button"
                onClick={() => set("ucetniVysledek", derived)}
                className="self-start text-xs text-blue-600 hover:underline"
              >
                Převzít z deníku ({derived} Kč)
              </button>
            ) : null}
          </div>
          <TextField
            label="ř.40 Položky zvyšující základ (souhrn)"
            value={form.nedanoveNaklady}
            onChange={(v) => set("nedanoveNaklady", v)}
            numeric
            hint="Neuznatelné náklady §25 aj. (bez odpisů — ty na ř.50). Detail Tabulky A dokončete v EPO."
          />
          <TextField
            label="ř.50 Účetní odpisy > daňové"
            value={form.odpisyUcetniNadDanove}
            onChange={(v) => set("odpisyUcetniNadDanove", v)}
            numeric
            hint="Rozdíl, o který účetní odpisy převyšují daňové (§26–33)."
          />
          <TextField
            label="ř.110 Položky snižující základ (souhrn)"
            value={form.osvobozeneVynosy}
            onChange={(v) => set("osvobozeneVynosy", v)}
            numeric
            hint="Osvobozené výnosy §19, srážka aj. (bez odpisů — ty na ř.150)."
          />
          <TextField
            label="ř.150 Daňové odpisy > účetní"
            value={form.odpisyDanoveNadUcetni}
            onChange={(v) => set("odpisyDanoveNadUcetni", v)}
            numeric
            hint="Rozdíl, o který daňové odpisy převyšují účetní (opak ř.50)."
          />
          <TextField
            label="ř.230 Odečet daňové ztráty (§34)"
            value={form.odpocetZtraty}
            onChange={(v) => set("odpocetZtraty", v)}
            numeric
          />
          <TextField
            label="ř.300 Slevy na dani (§35)"
            value={form.slevy}
            onChange={(v) => set("slevy", v)}
            numeric
          />
          <TextField
            label="Sazba daně"
            value={form.sazba}
            onChange={(v) => set("sazba", v)}
            numeric
            hint="Zadejte 21 nebo 0,21 (od 2024), 19 nebo 0,19 (2021–2023)."
          />
          {form.typPopldpp === "3" ? (
            <TextField
              label="ř.62 Vyloučení ztrátové hlavní činnosti (§18a)"
              value={form.excludeLoss}
              onChange={(v) => set("excludeLoss", v)}
              numeric
            />
          ) : null}
        </div>
      </section>

      {periodOutOfRange ? (
        <p className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
          Formulář DPPDP9 v05.01.01 pokrývá období do roku 2025. Pro rok {year}{" "}
          nemusí XSD kontrola projít.
        </p>
      ) : null}
      {zeroResult ? (
        <p className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800">
          Účetní výsledek je 0 — přiznání vyjde nulové. Zkontrolujte, zda je
          nahraný deník / zadaná hodnota správná.
        </p>
      ) : null}

      <div className="flex flex-wrap items-center gap-3">
        <Button
          type="button"
          disabled={!canGenerate}
          onClick={() => void generate()}
        >
          {busy ? "Generuji…" : "Vytvořit DPPO XML"}
        </Button>
        {missing.length > 0 ? (
          <span className="text-xs text-neutral-500">
            Doplňte: {missing.join(", ")}
          </span>
        ) : null}
      </div>

      {result ? <ResultPanel result={result} ico={org.ico} /> : null}
    </div>
  )
}

function ResultPanel({
  result,
  ico,
}: {
  result: DppoActionResult
  ico: string
}) {
  if (!result.ok) {
    return (
      <p className="rounded-lg border border-red-300 bg-red-50 p-3 text-sm text-red-700">
        {result.error}
      </p>
    )
  }
  const valid = result.xsd?.valid === true
  return (
    <div className="space-y-3">
      {valid ? (
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-green-300 bg-green-50 p-3">
          <span className="text-sm text-green-800">
            Dokument prošel XSD kontrolou.
          </span>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() =>
              result.xml &&
              downloadXml(result.xml, `dppo-${ico || "priznani"}.xml`)
            }
          >
            Stáhnout XML
          </Button>
        </div>
      ) : (
        <div className="rounded-lg border border-red-300 bg-red-50 p-3">
          <p className="text-sm font-medium text-red-700">
            Dokument neprošel XSD kontrolou — opravte a vytvořte znovu:
          </p>
          <ul className="mt-1 list-disc pl-5 text-xs text-red-700">
            {result.xsd?.errors.slice(0, 8).map((e, i) => (
              <li key={i}>{e}</li>
            ))}
          </ul>
        </div>
      )}
      {result.checks && result.checks.length > 0 ? (
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3">
          <p className="text-sm font-medium text-amber-800">Upozornění:</p>
          <ul className="mt-1 list-disc pl-5 text-xs text-amber-800">
            {result.checks.map((c, i) => (
              <li key={i}>
                {c.message}
                {c.suggestion ? ` (${c.suggestion})` : ""}
              </li>
            ))}
          </ul>
        </div>
      ) : null}
    </div>
  )
}
