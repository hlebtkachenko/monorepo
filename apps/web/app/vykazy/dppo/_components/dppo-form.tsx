"use client"

// DPPO (DPPDP9) generator — the interactive client piece of /vykazy/dppo.
// Reads org identity + the obratová předvaha from the shared /vykazy context,
// prefills the účetní výsledek (ř.10) from the deník, collects the daňové úpravy
// (§23–§35) the books cannot produce, and posts figures + meta to the server
// action, which serializes + XSD-validates. Download is gated on XSD validity.

import { useMemo, useState } from "react"

import { Button } from "@workspace/ui/components/button"
import { cn } from "@workspace/ui/lib/utils"

import { DPPO_TABULKA_B_RADKY } from "@workspace/filing/dppo"

import { useOrg } from "../../_lib/org-context"
import { FINANCNI_URADY } from "../../_data/ufo"
import { buildDppoXml, type DppoActionResult } from "../_lib/dppo-action"
import {
  deriveUcetniVysledek,
  deriveCistyObrat,
  defaultSazba,
  filingYear,
  applyFieldChange,
  emptyTabulkaB,
  tabulkaASoucet,
  tabulkaBSoucet,
  toFigures,
  toMeta,
  toPriloha,
  toZadost,
  toZaverka,
  missingRequired,
  type DppoFormState,
  type TabulkaARadek,
  type TabulkaBKey,
} from "../_lib/dppo-bridge"

const INPUT_CLASS =
  "rounded border border-border bg-card px-2 py-1.5 text-sm text-foreground outline-none focus:border-primary focus:ring-1 focus:ring-primary"

function initForm(
  ico: string,
  rok: string,
  ucetni: string,
  obrat: string,
): DppoFormState {
  const zdobdOd = rok ? `1.1.${rok}` : ""
  const zdobdDo = rok ? `31.12.${rok}` : ""
  return {
    katUj: "M",
    ucZav: true,
    cTelef: "",
    oprJmeno: "",
    oprPrijmeni: "",
    oprPostaveni: "STATUTÁRNÍ ORGÁN",
    audit: false,
    danPor: false,
    sbirkaListin: true,
    sbirkaEmail: "",
    tabulkaA: [{ uctovaSkupina: "", castka: "" }],
    tabulkaB: emptyTabulkaB(),
    cistyObrat: obrat,
    pocetZamestnancu: "0",
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
      <span className="text-xs font-medium text-muted-foreground">{label}</span>
      <input
        type="text"
        inputMode={numeric ? "numeric" : undefined}
        value={value}
        placeholder={placeholder}
        onChange={(e) => onChange(e.target.value)}
        className={cn(INPUT_CLASS, numeric && "text-right tabular-nums")}
      />
      {hint ? (
        <span className="text-xs text-muted-foreground">{hint}</span>
      ) : null}
    </label>
  )
}

export function DppoForm() {
  const { org, predvaha, values, crVariant, rozsah } = useOrg()
  const derived = useMemo(() => deriveUcetniVysledek(predvaha), [predvaha])
  const obrat = useMemo(() => deriveCistyObrat(predvaha), [predvaha])
  const hasDenik = predvaha.ucty.length > 0

  const [form, setForm] = useState<DppoFormState>(() =>
    initForm(org.ico, org.rok, derived, obrat),
  )
  const [result, setResult] = useState<DppoActionResult | null>(null)
  const [busy, setBusy] = useState(false)

  const set = (key: keyof DppoFormState, value: string) => {
    setForm((f) => applyFieldChange(f, key, value))
    setResult(null)
  }
  const patch = (next: Partial<DppoFormState>) => {
    setForm((f) => ({ ...f, ...next }))
    setResult(null)
  }
  const setTabulkaB = (key: TabulkaBKey, value: string) =>
    patch({ tabulkaB: { ...form.tabulkaB, [key]: value } })
  const setRadek = (index: number, next: Partial<TabulkaARadek>) =>
    patch({
      tabulkaA: form.tabulkaA.map((r, i) => (i === index ? { ...r, ...next } : r)), // prettier-ignore
    })

  const souctA = tabulkaASoucet(form.tabulkaA)
  const r40 = Number(form.nedanoveNaklady.replace(/\s/g, "").replace(",", ".")) || 0 // prettier-ignore
  const tabulkaAFoots = Math.round(souctA) === Math.round(r40)

  const missing = missingRequired(form)
  const canGenerate = missing.length === 0 && !busy
  const year = filingYear(form.zdobdOd)
  const periodOutOfRange = year !== null && year > 2025
  const zeroResult = !form.ucetniVysledek.trim() || form.ucetniVysledek === "0"

  const generate = async () => {
    setBusy(true)
    setResult(null)
    const res = await buildDppoXml(
      toFigures(form),
      toMeta(form, org, rozsah),
      toPriloha(form),
      toZaverka(values, crVariant, rozsah),
      toZadost(form),
    )
    setResult(res)
    setBusy(false)
  }

  return (
    <div className="space-y-5">
      <p className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm text-foreground">
        Účetní výsledek hospodaření (ř.10) se převezme z nahraného deníku.
        Daňové úpravy (§23–§35) doplňte ručně — deník je neobsahuje. Nástroj
        vytvoří XML pro ruční odeslání přes EPO;{" "}
        <strong>nepodává ani nepodepisuje</strong> přiznání a přiznává daňovou
        povinnost (ne doplatek).
      </p>

      {!hasDenik ? (
        <p className="rounded-lg border border-amber-300 bg-amber-50 p-3 text-sm text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          Nenačten žádný účetní deník. Účetní výsledek zadejte ručně, nebo jej
          nahrajte na stránce <em>Účetní deník</em> a vraťte se sem.
        </p>
      ) : null}

      <section className="rounded-lg border border-border bg-muted/40 p-4">
        <h2 className="mb-3 text-sm font-semibold text-foreground">
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
            <span className="text-xs font-medium text-muted-foreground">
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
            <span className="text-xs font-medium text-muted-foreground">
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
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Kategorie účetní jednotky (pol. 07)
            </span>
            <select
              value={form.katUj}
              onChange={(e) => patch({ katUj: e.target.value })}
              className={INPUT_CLASS}
            >
              <option value="M">M — mikro účetní jednotka</option>
              <option value="L">L — malá účetní jednotka</option>
              <option value="S">S — střední účetní jednotka</option>
              <option value="V">V — velká účetní jednotka</option>
            </select>
            <span className="text-xs text-muted-foreground">
              Zařazení podle § 1b zákona o účetnictví.
            </span>
          </label>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Účetní závěrka přiložena (pol. 11)
            </span>
            <span className="flex items-center gap-2 py-1.5">
              <input
                type="checkbox"
                checked={form.ucZav}
                onChange={(e) => patch({ ucZav: e.target.checked })}
                className="size-4"
              />
              <span className="text-sm text-foreground">
                Ano — účetní závěrka je součástí podání
              </span>
            </span>
            <span className="text-xs text-muted-foreground">
              Rozvaha a VZZ jsou v XML jako vyplněné výkazy — v EPO se načtou
              samy. Přílohu účetní závěrky vložte v EPO jako E-přílohu (§ 18
              ZoÚ).
            </span>
          </label>
          <TextField
            label="Telefon"
            value={form.cTelef}
            onChange={(v) => set("cTelef", v)}
            placeholder="601020304"
            hint="Kontakt, na který se finanční úřad obrací s dotazem."
          />
          <TextField
            label="Jméno oprávněné osoby"
            value={form.oprJmeno}
            onChange={(v) => set("oprJmeno", v)}
            placeholder="Jan"
            hint="Kdo přiznání podepisuje."
          />
          <TextField
            label="Příjmení oprávněné osoby"
            value={form.oprPrijmeni}
            onChange={(v) => set("oprPrijmeni", v)}
            placeholder="Novák"
          />
          <TextField
            label="Postavení oprávněné osoby"
            value={form.oprPostaveni}
            onChange={(v) => set("oprPostaveni", v)}
            placeholder="STATUTÁRNÍ ORGÁN"
            hint="Např. STATUTÁRNÍ ORGÁN nebo ZMOCNĚNEC."
          />
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Lhůta pro podání
            </span>
            <label className="flex items-center gap-2 py-1.5">
              <input
                type="checkbox"
                checked={form.audit}
                onChange={(e) => patch({ audit: e.target.checked })}
                className="size-4"
              />
              <span className="text-sm text-foreground">
                Závěrka ověřena auditorem
              </span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={form.danPor}
                onChange={(e) => patch({ danPor: e.target.checked })}
                className="size-4"
              />
              <span className="text-sm text-foreground">
                Zpracoval daňový poradce
              </span>
            </label>
            <span className="text-xs text-muted-foreground">
              Každá z těchto možností prodlužuje lhůtu podle § 136 daňového řádu
              na 6 měsíců po skončení zdaňovacího období.
            </span>
          </div>
          <label className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Sbírka listin (příloha č. 11)
            </span>
            <span className="flex items-center gap-2 py-1.5">
              <input
                type="checkbox"
                checked={form.sbirkaListin}
                onChange={(e) => patch({ sbirkaListin: e.target.checked })}
                className="size-4"
              />
              <span className="text-sm text-foreground">
                Žádám o předání závěrky rejstříkovému soudu
              </span>
            </span>
            <span className="text-xs text-muted-foreground">
              § 21b odst. 3 ZoÚ — finanční úřad předá rozvahu, VZZ a přílohu do
              sbírky listin, takže se závěrka nepodává zvlášť.
            </span>
          </label>
          {form.sbirkaListin ? (
            <TextField
              label="E-mail pro potvrzení o předání"
              value={form.sbirkaEmail}
              onChange={(v) => set("sbirkaEmail", v)}
              placeholder="ucetni@firma.cz"
              hint="Vlastní adresa, nikoli adresa rejstříkového soudu."
            />
          ) : null}
        </div>
      </section>

      <section className="rounded-lg border border-border bg-muted/40 p-4">
        <h2 className="mb-1 text-sm font-semibold text-foreground">
          Daňová část (II. oddíl)
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Zjednodušený souhrn: ostatní úpravy se knihují na obecné řádky (ř.40 /
          ř.110). Daň i základ vyjdou správně, ale přiznání není řádek po řádku
          úplné — tabulky E/G/H Přílohy č. 1 (k ř. 230/260/300) a případnou
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
                className="self-start text-xs text-primary hover:underline"
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

      <section className="rounded-lg border border-border bg-muted/40 p-4">
        <h2 className="mb-1 text-sm font-semibold text-foreground">
          Příloha č. 1 II. oddílu a tabulka K
        </h2>
        <p className="mb-3 text-xs text-muted-foreground">
          Vyplňují se jen tabulky, pro něž má poplatník věcnou náplň. Tabulku K
          ale vyplňují všichni poplatníci.
        </p>

        <h3 className="mb-1 text-xs font-semibold text-foreground">
          A. Rozdělení nákladů z ř.40 podle účtových skupin
        </h3>
        <p className="mb-2 text-xs text-muted-foreground">
          Součet na ř.13 musí být shodný s ř.40.
        </p>
        <div className="space-y-2">
          {form.tabulkaA.map((radek, index) => (
            <div key={index} className="flex items-center gap-2">
              <span className="w-6 text-right text-xs text-muted-foreground">
                {index + 1}
              </span>
              <input
                type="text"
                value={radek.uctovaSkupina}
                placeholder="54 - Jiné provozní náklady"
                onChange={(e) => setRadek(index, { uctovaSkupina: e.target.value })} // prettier-ignore
                className={cn(INPUT_CLASS, "min-w-0 flex-1")}
                maxLength={60}
              />
              <input
                type="text"
                inputMode="numeric"
                value={radek.castka}
                onChange={(e) => setRadek(index, { castka: e.target.value })}
                className={cn(INPUT_CLASS, "w-36 text-right tabular-nums")}
              />
              <button
                type="button"
                aria-label={`Odebrat řádek ${index + 1}`}
                onClick={() =>
                  patch({
                    tabulkaA: form.tabulkaA.filter((_, i) => i !== index),
                  })
                }
                className="px-1 text-sm text-muted-foreground hover:text-foreground"
              >
                ×
              </button>
            </div>
          ))}
        </div>
        <div className="mt-2 flex flex-wrap items-center gap-4">
          {form.tabulkaA.length < 12 ? (
            <button
              type="button"
              onClick={() =>
                patch({
                  tabulkaA: [
                    ...form.tabulkaA,
                    { uctovaSkupina: "", castka: "" },
                  ],
                })
              }
              className="text-xs text-primary hover:underline"
            >
              + Přidat řádek
            </button>
          ) : null}
          <span
            className={cn(
              "text-xs font-semibold",
              tabulkaAFoots ? "text-green-700" : "text-red-600",
            )}
          >
            {tabulkaAFoots ? "✓" : "✗"} ř.13 Celkem{" "}
            {souctA.toLocaleString("cs-CZ")} / ř.40{" "}
            {r40.toLocaleString("cs-CZ")}
          </span>
        </div>

        <h3 className="mt-5 mb-1 text-xs font-semibold text-foreground">
          B. Odpisy hmotného a nehmotného majetku
        </h3>
        <p className="mb-2 text-xs text-muted-foreground">
          Část a) daňové odpisy (ř.2 je na tiskopise neobsazený, proto je
          odpisová skupina 2 na ř.3). Část b) ř.12 účetní odpisy podle § 24
          odst. 2 písm. v).
        </p>
        <div className="space-y-1.5">
          {DPPO_TABULKA_B_RADKY.map(({ radek, label }) => (
            <label key={radek} className="flex items-center gap-2">
              <span className="w-6 text-right text-xs text-muted-foreground">
                {radek.slice(1)}
              </span>
              <span className="min-w-0 flex-1 text-xs text-foreground">
                {label}
              </span>
              <input
                type="text"
                inputMode="numeric"
                value={form.tabulkaB[radek]}
                onChange={(e) => setTabulkaB(radek, e.target.value)}
                className={cn(INPUT_CLASS, "w-36 text-right tabular-nums")}
              />
            </label>
          ))}
          <div className="flex items-center gap-2 border-t border-border pt-1.5">
            <span className="w-6 text-right text-xs font-semibold text-muted-foreground">
              11
            </span>
            <span className="min-w-0 flex-1 text-xs font-semibold text-foreground">
              Daňové odpisy hmotného a nehmotného majetku celkem
            </span>
            <span className="w-36 pr-2 text-right text-xs font-semibold tabular-nums">
              {tabulkaBSoucet(form.tabulkaB).toLocaleString("cs-CZ")}
            </span>
          </div>
          <label className="flex items-center gap-2">
            <span className="w-6 text-right text-xs text-muted-foreground">
              12
            </span>
            <span className="min-w-0 flex-1 text-xs text-foreground">
              Účetní odpisy majetku, který se podle zákona neodpisuje (§ 24
              odst. 2 písm. v)
            </span>
            <input
              type="text"
              inputMode="numeric"
              value={form.tabulkaB.r12}
              onChange={(e) => setTabulkaB("r12", e.target.value)}
              className={cn(INPUT_CLASS, "w-36 text-right tabular-nums")}
            />
          </label>
        </div>

        <h3 className="mt-5 mb-2 text-xs font-semibold text-foreground">
          K. Vybrané ukazatele hospodaření
        </h3>
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div className="flex flex-col gap-1">
            <TextField
              label="ř.1 Roční úhrn čistého obratu"
              value={form.cistyObrat}
              onChange={(v) => patch({ cistyObrat: v })}
              numeric
              hint="§ 1d odst. 2 ZoÚ — výnosy z prodeje výrobků, zboží a služeb (účtová skupina 60), stejně jako VZZ ř.56."
            />
            {hasDenik ? (
              <button
                type="button"
                onClick={() => patch({ cistyObrat: obrat })}
                className="self-start text-xs text-primary hover:underline"
              >
                Převzít z deníku ({obrat} Kč)
              </button>
            ) : null}
          </div>
          <TextField
            label="ř.2 Průměrný přepočtený počet zaměstnanců"
            value={form.pocetZamestnancu}
            onChange={(v) => patch({ pocetZamestnancu: v })}
            numeric
            hint="Nula je platná odpověď, prázdné pole není."
          />
        </div>
      </section>

      {periodOutOfRange ? (
        <p className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
          Formulář DPPDP9 v05.01.01 pokrývá období do roku 2025. Pro rok {year}{" "}
          nemusí XSD kontrola projít.
        </p>
      ) : null}
      {zeroResult ? (
        <p className="rounded border border-amber-300 bg-amber-50 p-2 text-xs text-amber-800 dark:border-amber-800 dark:bg-amber-950/40 dark:text-amber-200">
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
          <span className="text-xs text-muted-foreground">
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
        <div className="flex flex-wrap items-center gap-3 rounded-lg border border-green-300 bg-green-50 p-3 dark:border-green-800 dark:bg-green-950/40">
          <span className="text-sm text-green-800 dark:text-green-200">
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
        <div className="rounded-lg border border-amber-300 bg-amber-50 p-3 dark:border-amber-800 dark:bg-amber-950/40">
          <p className="text-sm font-medium text-amber-800 dark:text-amber-200">
            Upozornění:
          </p>
          <ul className="mt-1 list-disc pl-5 text-xs text-amber-800 dark:text-amber-200">
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
