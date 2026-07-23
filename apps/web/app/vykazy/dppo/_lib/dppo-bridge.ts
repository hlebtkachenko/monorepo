// Pure bridge between the /vykazy statement builder and the @workspace/filing
// DPPO engine. No React, no I/O, no filing runtime import (types only) — safe to
// unit-test and to call from both the client page and the server action.

import type { DppoFigures, DppoFilingMeta } from "@workspace/filing/dppo"

import type { OrgConfig } from "../../_lib/types"
import type { Predvaha } from "../../_lib/predvaha"

/**
 * Účetní výsledek hospodaření PŘED zdaněním (DPPO ř.10), in exact whole koruna.
 *
 * Derived from the obratová předvaha — NOT from the mapped výkaz values, which
 * `mapPredvahaToValues` stores rounded to whole thousands (`toTisice`). The
 * předvaha is the only Kč-exact source.
 *
 *   VH = Σ výnosy (třída 6)  −  Σ náklady (třída 5, mimo skupinu 59)
 *
 * Účtová skupina 59 (daň z příjmů + převodové účty) is excluded — that is exactly
 * what VZZ ř.049 excludes before ř.050 "Daň z příjmů". Výnos je kreditní zůstatek
 * (obratDal − obratMD); náklad je debetní (obratMD − obratDal). Zisk +, ztráta −.
 */
export function deriveUcetniVysledek(predvaha: Predvaha): string {
  let vysledek = 0
  for (const u of predvaha.ucty) {
    const s = u.synteticky
    if (s.startsWith("6")) {
      vysledek += u.obratDal - u.obratMD
    } else if (s.startsWith("5") && !s.startsWith("59")) {
      vysledek -= u.obratMD - u.obratDal
    }
  }
  return String(Math.round(vysledek))
}

/**
 * Best-effort split of a free-text sídlo ("Nádražní 12/3") into ulice + č.p.
 * `c_pop` is `xs:decimal` in the XSD, so it MUST be a bare integer — the č.or.
 * suffix after "/" is dropped, and when no leading house number is found `c_pop`
 * is left empty (VetaP address is XSD-optional; an invalid decimal is not).
 */
export function splitSidlo(sidlo: string): { ulice: string; c_pop: string } {
  const trimmed = sidlo.trim()
  if (!trimmed) return { ulice: "", c_pop: "" }
  // "<ulice> <čp>[/<čor>]" — capture the street and the first integer run.
  const m = trimmed.match(/^(.*?)[\s,]+(\d+)(?:\/\S*)?\s*$/)
  if (m && m[1]?.trim()) {
    return { ulice: m[1].trim(), c_pop: m[2] ?? "" }
  }
  return { ulice: trimmed, c_pop: "" }
}

/**
 * Statutory DPPO rate for a period, as a decimal fraction. 19 % for zdaňovací
 * období 2021–2023, 21 % from 2024 (zákon č. 586/1992 Sb., novela od 2024).
 * Reads the year from a D.M.YYYY / ISO `zdobd_od`; defaults to 21 % when unknown.
 */
export function defaultSazba(zdobdOd: string): string {
  const year = filingYear(zdobdOd)
  return year !== null && year < 2024 ? "0.19" : "0.21"
}

/** Extract the four-digit year from a D.M.YYYY or ISO date, or null. */
export function filingYear(date: string): number | null {
  const iso = date.match(/^(\d{4})-\d{2}-\d{2}/)
  if (iso) return Number(iso[1])
  const cz = date.match(/\.(\d{4})\s*$/)
  if (cz) return Number(cz[1])
  return null
}

/** The editable DPPO form state (all fields as entered strings). */
export interface DppoFormState {
  dic: string
  cUfoCil: string
  cNace: string
  typPopldpp: "1" | "3"
  zdobdOd: string
  zdobdDo: string
  /** Účetní výsledek ř.10 — prefilled from the deník, user-overridable. */
  ucetniVysledek: string
  nedanoveNaklady: string
  osvobozeneVynosy: string
  odpocetZtraty: string
  slevy: string
  /** Decimal fraction, e.g. "0.21". */
  sazba: string
  /** ř.62 §18a — only meaningful for a veřejně prospěšný poplatník (typ 3). */
  excludeLoss: string
}

/** Normalize a money input ("150 000", "150000,50", "") → whole-koruna string. */
function kc(v: string): string {
  const cleaned = v.replace(/\s/g, "").replace(",", ".").trim()
  if (!cleaned || cleaned === "-") return "0"
  return cleaned
}

/**
 * Normalize the sazba input to a decimal fraction. Accepts both a fraction
 * ("0.21") and a whole percent ("21") — a value ≥ 1 is treated as a percent and
 * divided by 100, so a user typing "21" does not emit "2100" (which would blow
 * the XSD `totalDigits=2` on ř.280). Blank / non-numeric → 21 %.
 */
export function normalizeSazba(v: string): string {
  const cleaned = v.replace(/\s/g, "").replace(",", ".").trim()
  const n = Number(cleaned)
  if (!cleaned || !Number.isFinite(n)) return "0.21"
  return n >= 1 ? String(n / 100) : cleaned
}

export function toFigures(form: DppoFormState): DppoFigures {
  const figures: DppoFigures = {
    ucetni_vysledek: kc(form.ucetniVysledek),
    nedanove_naklady: kc(form.nedanoveNaklady),
    osvobozene_vynosy: kc(form.osvobozeneVynosy),
    odpocet_ztraty: kc(form.odpocetZtraty),
    slevy: kc(form.slevy),
    sazba: normalizeSazba(form.sazba),
  }
  if (form.typPopldpp === "3" && kc(form.excludeLoss) !== "0") {
    figures.exclude_loss = kc(form.excludeLoss)
  }
  return figures
}

export function toMeta(form: DppoFormState, org: OrgConfig): DppoFilingMeta {
  const { ulice, c_pop } = splitSidlo(org.sidlo)
  const meta: DppoFilingMeta = {
    zdobd_od: form.zdobdOd.trim(),
    zdobd_do: form.zdobdDo.trim(),
    c_ufo_cil: form.cUfoCil.trim(),
    dic: form.dic.trim(),
    typ_popldpp: form.typPopldpp,
  }
  if (org.nazev.trim()) meta.name = org.nazev.trim()
  if (org.obec.trim()) meta.naz_obce = org.obec.trim()
  if (ulice) meta.ulice = ulice
  if (c_pop) meta.c_pop = c_pop
  const psc = org.psc.replace(/\s/g, "").trim()
  if (psc) meta.psc = psc
  const nace = form.cNace.replace(/\s/g, "").trim()
  if (nace) meta.c_nace = nace
  return meta
}

/**
 * The XSD/EPO-required fields the warn-only `checkDppo` cannot enforce for us.
 * The page disables Generate until these are present; XSD validation server-side
 * is the hard gate.
 */
export function missingRequired(form: DppoFormState): string[] {
  const missing: string[] = []
  if (!form.dic.trim()) missing.push("DIČ")
  if (!form.cUfoCil.trim()) missing.push("Finanční úřad")
  if (!form.zdobdOd.trim()) missing.push("Zdaňovací období od")
  if (!form.zdobdDo.trim()) missing.push("Zdaňovací období do")
  return missing
}

/**
 * Apply one field edit to the form state. The statutory rate follows the
 * zdaňovací období, so editing `zdobdOd` re-derives `sazba` in the same update —
 * a return never keeps the prior year's rate.
 */
export function applyFieldChange(
  form: DppoFormState,
  key: keyof DppoFormState,
  value: string,
): DppoFormState {
  const next = { ...form, [key]: value }
  if (key === "zdobdOd") next.sazba = defaultSazba(value)
  return next
}
