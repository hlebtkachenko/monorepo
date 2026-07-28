// Pure bridge between the /vykazy statement builder and the @workspace/filing
// DPPO engine. No React, no I/O, no filing runtime import (types only) — safe to
// unit-test and to call from both the client page and the server action.

import type {
  DppoFigures,
  DppoFilingMeta,
  DppoPriloha,
  DppoTabulkaB,
  DppoZadostSbirka,
  DppoZaverka,
} from "@workspace/filing/dppo"

import { rozvahaAktiva, rozvahaPasiva } from "../../_data/rozvaha"
import { VZZ } from "../../_data/vzz"
import { computeAll } from "../../_lib/engine"
import { inRozsah } from "../../_lib/rozsah"
import type { VykazValuesByStatement } from "../../_lib/storage"
import type { CasoveRozliseni, OrgConfig, Rozsah } from "../../_lib/types"
import type { Predvaha } from "../../_lib/predvaha"

/**
 * Náklady that sit BELOW "** Výsledek hospodaření před zdaněním" on the VZZ, so
 * they must not reduce DPPO ř.10: the daň z příjmů (590/591/592/595 and 599, the
 * rezerva na daň z příjmů) and 596, which is položka "M. Převod podílu na
 * výsledku hospodaření společníkům" — reported below ř.053, not ř.049.
 *
 * The rest of skupina 59, i.e. the převodové účty 597 a 598, DOES belong in the
 * result: they are reported in "F.5. Jiné provozní náklady" / "K. Ostatní
 * finanční náklady" and cancel against their 697 / 698 counterparts, which are
 * třída 6 and therefore counted. Dropping only one side would inflate ř.10.
 */
const BELOW_VYSLEDEK_PRED_ZDANENIM = new Set([
  "590",
  "591",
  "592",
  "595",
  "596",
  "599",
])

/**
 * Účetní výsledek hospodaření PŘED zdaněním (DPPO ř.10), in exact whole koruna.
 *
 * Derived from the obratová předvaha — NOT from the mapped výkaz values, which
 * `mapPredvahaToValues` reports v celých tisících. The předvaha is the only
 * Kč-exact source.
 *
 *   VH = Σ výnosy (třída 6) − Σ náklady (třída 5, mimo the set above)
 *
 * which is exactly what the VZZ foots to on ř.049. Výnos je kreditní zůstatek
 * (obratDal − obratMD); náklad je debetní (obratMD − obratDal). Zisk +, ztráta −.
 */
export function deriveUcetniVysledek(predvaha: Predvaha): string {
  let vysledek = 0
  for (const u of predvaha.ucty) {
    const s = u.synteticky
    if (s.startsWith("6")) {
      vysledek += u.obratDal - u.obratMD
    } else if (s.startsWith("5") && !BELOW_VYSLEDEK_PRED_ZDANENIM.has(s)) {
      vysledek -= u.obratMD - u.obratDal
    }
  }
  return String(Math.round(vysledek))
}

/**
 * Roční úhrn čistého obratu (tabulka K ř.1), in exact whole koruna.
 *
 * § 1d odst. 2 věta druhá zákona o účetnictví defines it as the výnosy from
 * selling výrobky and zboží and from providing služby — i.e. účtová skupina 60,
 * which is exactly what VZZ ř.01 + ř.02 foot to and therefore what the VZZ
 * reports on ř.56. Deriving it the same way here keeps the two statements
 * agreeing on one statutory quantity.
 *
 * NOT the whole třída 6: ostatní provozní výnosy (skupina 64) and finanční
 * výnosy (skupiny 66 a 67) are not tržby. The all-výnosy reading belongs to
 * § 1d odst. 5, which applies to a veřejně prospěšný poplatník only.
 */
export function deriveCistyObrat(predvaha: Predvaha): string {
  let obrat = 0
  for (const u of predvaha.ucty) {
    if (u.synteticky.startsWith("60")) obrat += u.obratDal - u.obratMD
  }
  return String(Math.round(obrat))
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
  /** ř.50 — účetní odpisy převyšují daňové (base-increasing). */
  odpisyUcetniNadDanove: string
  osvobozeneVynosy: string
  /** ř.150 — daňové odpisy převyšují účetní (base-decreasing). */
  odpisyDanoveNadUcetni: string
  odpocetZtraty: string
  slevy: string
  /** Decimal fraction, e.g. "0.21". */
  sazba: string
  /** ř.62 §18a — only meaningful for a veřejně prospěšný poplatník (typ 3). */
  excludeLoss: string
  /** I. oddíl pol. 07 — kategorie účetní jednotky (M/L/S/V, § 1b ZoÚ). */
  katUj: string
  /** I. oddíl pol. 11 — účetní závěrka přiložena jako E-přílohy v EPO. */
  ucZav: boolean
  /** Telefon poplatníka — EPO prints it and uses it for queries. */
  cTelef: string
  /** Osoba oprávněná jednat za poplatníka (I. oddíl, "Podpis"). */
  oprJmeno: string
  oprPrijmeni: string
  oprPostaveni: string
  /** Účetní závěrka ověřena auditorem. With `danPor`, decides the § 136 DŘ deadline. */
  audit: boolean
  /** Přiznání zpracoval a předkládá daňový poradce. */
  danPor: boolean
  /**
   * Žádost o předání účetní závěrky do sbírky listin (§ 21b odst. 3 ZoÚ) — the
   * FÚ forwards the závěrka to the rejstříkový soud, so it is filed once.
   */
  sbirkaListin: boolean
  /** E-mail for the confirmation. The filer's own, never the soud's. */
  sbirkaEmail: string
  /** Tabulka A — rozpis ř.40 podle účtových skupin (max 12 řádků). */
  tabulkaA: TabulkaARadek[]
  /** Tabulka B — daňové odpisy podle odpisových skupin, keyed by řádek. */
  tabulkaB: Record<TabulkaBKey, string>
  /** Tabulka K ř.1 — roční úhrn čistého obratu. */
  cistyObrat: string
  /** Tabulka K ř.2 — průměrný přepočtený počet zaměstnanců. */
  pocetZamestnancu: string
}

export interface TabulkaARadek {
  uctovaSkupina: string
  castka: string
}

export type TabulkaBKey = keyof DppoTabulkaB

/** Every tabulka B cell the tiskopis prints, in řádek order (ř.2 is neobsazeno). */
const TABULKA_B_KEYS: TabulkaBKey[] = [
  "r1",
  "r3",
  "r4",
  "r5",
  "r6",
  "r7",
  "r8",
  "r9",
  "r10",
  "r12",
]

/** A blank tabulka B — every cell present and empty, so the inputs stay controlled. */
export function emptyTabulkaB(): Record<TabulkaBKey, string> {
  return Object.fromEntries(TABULKA_B_KEYS.map((k) => [k, ""])) as Record<
    TabulkaBKey,
    string
  >
}

/** Sum the entered částky of tabulka A — the ř.13 Celkem that must equal ř.40. */
export function tabulkaASoucet(radky: TabulkaARadek[]): number {
  return radky.reduce((sum, r) => sum + (Number(kc(r.castka)) || 0), 0)
}

/** Sum ř.1 až 10 of tabulka B — the ř.11 Celkem. Excludes ř.12 (účetní odpisy). */
export function tabulkaBSoucet(tabulka: Record<TabulkaBKey, string>): number {
  return TABULKA_B_KEYS.filter((k) => k !== "r12").reduce(
    (sum, k) => sum + (Number(kc(tabulka[k])) || 0),
    0,
  )
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
  if (kc(form.odpisyUcetniNadDanove) !== "0") {
    figures.odpisy_ucetni_nad_danove = kc(form.odpisyUcetniNadDanove)
  }
  if (kc(form.odpisyDanoveNadUcetni) !== "0") {
    figures.odpisy_danove_nad_ucetni = kc(form.odpisyDanoveNadUcetni)
  }
  if (form.typPopldpp === "3" && kc(form.excludeLoss) !== "0") {
    figures.exclude_loss = kc(form.excludeLoss)
  }
  return figures
}

/**
 * Build Příloha č. 1 II. oddílu + tabulka K from the form.
 *
 * Tabulky A and B are omitted entirely when the user entered nothing for them
 * ("Vyplňují se pouze ty tabulky přílohy, pro něž má poplatník věcnou náplň"),
 * but tabulka K always goes: the Pokyny require ř.1 and ř.2 from every
 * poplatník, and an entered 0 is a real answer there, not a blank.
 */
export function toPriloha(form: DppoFormState): DppoPriloha {
  const radky = form.tabulkaA.filter(
    (r) => r.uctovaSkupina.trim() !== "" || kc(r.castka) !== "0",
  )
  const tabulkaB: DppoTabulkaB = {}
  for (const key of TABULKA_B_KEYS) {
    const value = kc(form.tabulkaB[key])
    if (value !== "0") tabulkaB[key] = value
  }

  const priloha: DppoPriloha = {
    tabulkaK: {
      cistyObrat: kc(form.cistyObrat),
      pocetZamestnancu: kc(form.pocetZamestnancu),
      // Měna účetnictví; the attribute carries a kritická kontrola forbidding it
      // before 1. 1. 2024, so it only rides along from that period on.
      ...((filingYear(form.zdobdOd) ?? 0) >= 2024 ? { mena: "CZK" } : {}),
    },
  }
  if (radky.length > 0) {
    priloha.tabulkaA = radky.map((r) => ({
      uctovaSkupina: r.uctovaSkupina.trim(),
      castka: kc(r.castka),
    }))
  }
  if (Object.keys(tabulkaB).length > 0) priloha.tabulkaB = tabulkaB
  return priloha
}

/**
 * Rozsah codes EPO uses for the účetní výkazy. The rozvaha has three (§ 3a odst.
 * 2 gives malá and mikro their own zkrácený tvar); the VZZ has two, because
 * § 3a odst. 4 prescribes ONE zkrácený tvar for both — so a mikro ÚJ reports the
 * rozvaha as M and the VZZ as Z, and the two must then be declared separately.
 */
const UV_ROZSAH_ROZVAHA: Record<Rozsah, string> = {
  plny: "P",
  mala: "Z",
  mikro: "M",
}
const UV_ROZSAH_VZZ: Record<Rozsah, string> = {
  plny: "P",
  mala: "Z",
  mikro: "Z",
}

export function toMeta(
  form: DppoFormState,
  org: OrgConfig,
  rozsah: Rozsah,
): DppoFilingMeta {
  const { ulice, c_pop } = splitSidlo(org.sidlo)
  const meta: DppoFilingMeta = {
    zdobd_od: form.zdobdOd.trim(),
    zdobd_do: form.zdobdDo.trim(),
    c_ufo_cil: form.cUfoCil.trim(),
    dic: form.dic.trim(),
    typ_popldpp: form.typPopldpp,
    // "A" only declares that the E-přílohy will be there; attaching Rozvahu,
    // VZZ and Přílohu účetní závěrky is a step the filer does in EPO.
    uc_zav: form.ucZav ? "A" : "N",
    // Řádná závěrka: this builder only produces one drawn up to the rozvahový
    // den of the zdaňovací období, never a mimořádná or mezitímní one.
    uz_rad: "T",
    audit: form.audit ? "A" : "N",
    dan_por: form.danPor ? "A" : "N",
    // Vyhláška č. 500/2002 Sb. — the podnikatel výkazy this builder produces.
    uv_vyhl: "500",
    // Povinné od roku 2024. The builder reports v celých tisících Kč; § 24a ZoÚ
    // would allow EUR/USD/GBP as a funkční měna, which this app does not do.
    uv_mena: "CZK",
  }
  const rozvahaRozsah = UV_ROZSAH_ROZVAHA[rozsah]
  const vzzRozsah = UV_ROZSAH_VZZ[rozsah]
  if (rozvahaRozsah === vzzRozsah) {
    meta.uv_rozsah = rozvahaRozsah
  } else {
    meta.uv_rozsah_rozv = rozvahaRozsah
    meta.uv_rozsah_vzz = vzzRozsah
  }
  if (form.katUj) meta.kat_uj = form.katUj
  if (org.nazev.trim()) meta.name = org.nazev.trim()
  if (org.obec.trim()) meta.naz_obce = org.obec.trim()
  if (ulice) meta.ulice = ulice
  if (c_pop) meta.c_pop = c_pop
  const psc = org.psc.replace(/\s/g, "").trim()
  if (psc) meta.psc = psc
  const nace = form.cNace.replace(/\s/g, "").trim()
  if (nace) meta.c_nace = nace
  // Rozvahový den. The org block already carries it as the "ke dni" the výkazy
  // are drawn up to, so the filer does not retype it.
  const keDni = org.keDni.trim()
  if (keDni) meta.d_uv = keDni
  const telef = form.cTelef.replace(/\s/g, "").trim()
  if (telef) meta.c_telef = telef
  const oprJmeno = form.oprJmeno.trim()
  if (oprJmeno) meta.opr_jmeno = oprJmeno
  const oprPrijmeni = form.oprPrijmeni.trim()
  if (oprPrijmeni) meta.opr_prijmeni = oprPrijmeni
  const oprPostaveni = form.oprPostaveni.trim()
  if (oprPostaveni) meta.opr_postaveni = oprPostaveni
  return meta
}

/**
 * Žádost o předání účetní závěrky do sbírky listin, or undefined when the
 * poplatník does not ask for one.
 *
 * A podnikatel draws up rozvaha, VZZ and příloha (§ 18 odst. 1), so those three
 * are what the žádost covers. The přehledy (§ 18 odst. 2) and the MÚS závěrka
 * (§ 19a) are outside what this builder produces, so they are never requested.
 */
export function toZadost(form: DppoFormState): DppoZadostSbirka | undefined {
  if (!form.sbirkaListin) return undefined
  return {
    rozvaha: true,
    vzz: true,
    priloha: true,
    email: form.sbirkaEmail.trim() || undefined,
  }
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

/**
 * The účetní závěrka as EPO's own tables — Rozvaha + Výkaz zisku a ztráty
 * carried inside the DPPDP9 XML, so the poplatník does not retype the výkazy
 * into the portal.
 *
 * Formulas are evaluated here rather than read from the stored values: the store
 * holds only what was typed (leaves plus any override), while EPO wants a číslo
 * on every řádek of the form, aggregates included. Rows follow the rozsah and
 * the časové-rozlišení variant the výkazy are actually reported in; `hideEmpty`
 * is a screen toggle and deliberately has no effect here, since an empty položka
 * of a reported rozsah is still a reported zero.
 */
export function toZaverka(
  values: VykazValuesByStatement,
  crVariant: CasoveRozliseni,
  rozsah: Rozsah,
): DppoZaverka {
  const aktiva = rozvahaAktiva(crVariant)
  const pasiva = rozvahaPasiva(crVariant)
  const aktivaComputed = computeAll(aktiva, values.rozvahaAktiva)
  const pasivaComputed = computeAll(pasiva, values.rozvahaPasiva)
  const vzzComputed = computeAll(VZZ, values.vzz)

  return {
    aktiva: aktiva.lines
      .filter((line) => inRozsah(aktiva.id, line, rozsah))
      .map((line) => {
        const row = aktivaComputed[line.rada] ?? {}
        return {
          radek: line.rada,
          brutto: row.brutto ?? 0,
          // Korekce prints "x" on a položka it does not apply to (pohledávky,
          // peněžní prostředky, časové rozlišení); sending a 0 there would
          // state a figure the výkaz says does not exist.
          ...(line.korekceNA ? {} : { korekce: row.korekce ?? 0 }),
          netto: row.netto ?? 0,
          nettoMinule: row.minule ?? 0,
        }
      }),
    pasiva: pasiva.lines
      .filter((line) => inRozsah(pasiva.id, line, rozsah))
      .map((line) => ({
        radek: line.rada,
        bezne: pasivaComputed[line.rada]?.bezne ?? 0,
        minule: pasivaComputed[line.rada]?.minule ?? 0,
      })),
    vzz: VZZ.lines
      .filter((line) => inRozsah(VZZ.id, line, rozsah))
      .map((line) => ({
        radek: line.rada,
        bezne: vzzComputed[line.rada]?.bezne ?? 0,
        minule: vzzComputed[line.rada]?.minule ?? 0,
      })),
  }
}
