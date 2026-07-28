// Projection: DPH evidence → the three typed EPO documents. Pure functions, no
// React, no I/O, no localStorage — everything here is unit-testable in isolation,
// which matters because a bug in this file is a wrong tax filing.
//
// The three filings are projections of ONE evidence array on purpose. EPO
// cross-checks the kontrolní hlášení against the přiznání (Σ A.4 + A.5 základ
// against ř.1 + ř.2), so deriving them from separate sources would let them drift
// and generate výzvy.

import Decimal from "decimal.js-light"
import {
  koruna,
  korunaNahoru,
  haler,
  type Dphdp3Input,
  type Dphkh1Input,
  type DphshvInput,
} from "@workspace/filing/dph"

import { DPH_LINE_BY_R } from "../../_data/dph-priznani"
import type { DphEvidence, DphEvidenceRow } from "./dph-evidence"

/** Identity block — mirrors the org config the builder already collects. */
export interface DphOrgMeta {
  /** Kód finančního úřadu (3-digit). */
  c_ufo: string
  /** DIČ, with or without the CZ prefix. */
  dic: string
  /** "P" právnická / "F" fyzická. */
  typ_ds: string
  nazev?: string
  naz_obce?: string
  ulice?: string
  c_pop?: string
  psc?: string
  email?: string
  c_telef?: string
}

const dec = (v: string | undefined) => new Decimal(v && v !== "" ? v : 0)

/** Sum a field over rows, exactly (never native number arithmetic — money rule). */
function sum(rows: DphEvidenceRow[], pick: (r: DphEvidenceRow) => string) {
  return rows.reduce((acc, r) => acc.plus(dec(pick(r))), new Decimal(0))
}

// ── Přiznání k DPH ───────────────────────────────────────────────────────────

/**
 * Build the DPHDP3 model. Every evidence row carries the řádek it belongs to, so
 * the projection is a group-by over `radek`: the line's `base`/`dan` attributes
 * come from the statutory taxonomy, and rows on the same řádek add up.
 *
 * ř.62–65 are NOT computed here — `applyDphdp3Totals` from @workspace/filing
 * derives them from the XSD annotations, and doing it twice would risk two
 * different answers.
 */
export function projectPriznani(
  evidence: DphEvidence,
  meta: DphOrgMeta,
  forma = "B",
): Dphdp3Input {
  const vety: Record<number, Record<string, string>> = {
    1: {},
    2: {},
    3: {},
    4: {},
    5: {},
    6: {},
  }

  const byRadek = new Map<string, DphEvidenceRow[]>()
  for (const row of evidence.rows) {
    const list = byRadek.get(row.radek)
    if (list) list.push(row)
    else byRadek.set(row.radek, [row])
  }

  for (const [radek, rows] of byRadek) {
    const line = DPH_LINE_BY_R.get(radek)
    // An unknown or derived řádek is dropped rather than guessed onto an attribute.
    if (!line || line.derived) continue
    const target = vety[line.veta]
    if (!target) continue
    if (line.base) {
      const v = koruna(sum(rows, (r) => r.zaklad).toString())
      if (v && v !== "0") target[line.base] = v
    }
    if (line.dan) {
      const v = koruna(sum(rows, (r) => r.dan).toString())
      if (v && v !== "0") target[line.dan] = v
    }
  }

  // Manual values last so an explicitly typed figure always wins over a projected
  // one — the §76 koeficient and the krácený column are the plátce's own facts.
  for (const [attr, raw] of Object.entries(evidence.manual)) {
    if (raw === "") continue
    const line = MANUAL_ATTR_VETA[attr]
    if (line === undefined) continue
    const target = vety[line]
    if (!target) continue
    // Koeficient attributes are percentages, not money — pass them through.
    target[attr] = KOEFICIENT_ATTRS.has(attr)
      ? raw.trim()
      : (koruna(raw) ?? raw.trim())
  }

  const notEmpty = (r: Record<string, string>) =>
    Object.keys(r).length > 0 ? r : undefined

  return {
    header: {
      dapdph_forma: forma,
      typ_platce: "P",
      rok: evidence.rok,
      mesic: evidence.mesic,
      ctvrt: evidence.ctvrt,
    },
    payer: {
      c_ufo: meta.c_ufo,
      dic: meta.dic,
      typ_ds: meta.typ_ds,
      zkrobchjm: meta.nazev,
      naz_obce: meta.naz_obce,
      ulice: meta.ulice,
      c_pop: meta.c_pop,
      psc: meta.psc,
      email: meta.email,
      c_telef: meta.c_telef,
    },
    veta1: notEmpty(vety[1]!),
    veta2: notEmpty(vety[2]!),
    veta3: notEmpty(vety[3]!),
    veta4: notEmpty(vety[4]!),
    veta5: notEmpty(vety[5]!),
    veta6: notEmpty(vety[6]!),
  }
}

/** Which věta each manual attribute belongs to. */
const MANUAL_ATTR_VETA: Record<string, number> = {
  plnosv_nkf: 5,
  koef_p20_nov: 5,
  odp_uprav_kf: 5,
  koef_p20_vypor: 5,
  vypor_odp: 5,
  odp_tuz23_nar: 4,
  odp_tuz5_nar: 4,
  odp_cu_nar: 4,
  odkr_zdp23: 4,
  odkr_zdp5: 4,
  odp_rez_nar: 4,
  odp_sum_kr: 4,
  odkr_maj: 4,
}

/** Percentage fields — they must not be run through the money formatter. */
const KOEFICIENT_ATTRS = new Set(["koef_p20_nov", "koef_p20_vypor"])

// ── Kontrolní hlášení ────────────────────────────────────────────────────────

/** Rate buckets in KH's haléř format (1 = 21 %, 2 = 12 %). */
function buckets(rows: DphEvidenceRow[]): Record<string, string> {
  const out: Record<string, string> = {}
  const put = (key: string, value: Decimal) => {
    const f = haler(value.toString())
    if (f && f !== "0.00") out[key] = f
  }
  const at = (rate: number, pick: (r: DphEvidenceRow) => string) =>
    sum(
      rows.filter((r) => r.sazba === rate),
      pick,
    )
  put(
    "zakl_dane1",
    at(21, (r) => r.zaklad),
  )
  put(
    "dan1",
    at(21, (r) => r.dan),
  )
  put(
    "zakl_dane2",
    at(12, (r) => r.zaklad),
  )
  put(
    "dan2",
    at(12, (r) => r.dan),
  )
  return out
}

/** Group rows of one KH section by doklad, so one doklad is one řádek. */
function byDoklad(rows: DphEvidenceRow[]): DphEvidenceRow[][] {
  const map = new Map<string, DphEvidenceRow[]>()
  for (const r of rows) {
    const key = `${r.dic}|${r.evc}|${r.dppd}|${r.kodPredPl ?? ""}`
    const list = map.get(key)
    if (list) list.push(r)
    else map.set(key, [r])
  }
  return [...map.values()]
}

/**
 * Build the DPHKH1 model.
 *
 * The KH period is its own field: a kontrolní hlášení is MONTHLY for every
 * právnická osoba regardless of the DPH cadence (§ 101e odst. 1), so a quarterly
 * plátce still files twelve of them. Deriving the KH period from the přiznání
 * period is the classic way to file a wrong hlášení.
 */
export function projectKontrolniHlaseni(
  evidence: DphEvidence,
  meta: DphOrgMeta,
  forma = "B",
): Dphkh1Input {
  const inSection = (s: string) => evidence.rows.filter((r) => r.khSekce === s)

  const a1 = byDoklad(inSection("A1")).map((rows) => {
    const first = rows[0]!
    return {
      dic_odb: first.dic,
      c_evid_dd: first.evc,
      duzp: first.dppd,
      // A.1 carries základ only — the odběratel self-assesses the daň.
      zakl_dane1: haler(sum(rows, (r) => r.zaklad).toString()) ?? "0.00",
      kod_pred_pl: first.kodPredPl ?? "",
    }
  })

  const a2 = byDoklad(inSection("A2")).map((rows) => {
    const first = rows[0]!
    return {
      vatid_dod: first.dic || undefined,
      c_evid_dd: first.evc,
      dppd: first.dppd,
      ...buckets(rows),
    }
  })

  const a4 = byDoklad(inSection("A4")).map((rows) => {
    const first = rows[0]!
    return {
      dic_odb: first.dic,
      c_evid_dd: first.evc,
      dppd: first.dppd,
      ...buckets(rows),
      kod_rezim_pl: first.kodRezimPl ?? "0",
      zdph_44: first.zdph44 ?? "N",
    }
  })

  const b1 = byDoklad(inSection("B1")).map((rows) => {
    const first = rows[0]!
    return {
      dic_dod: first.dic,
      c_evid_dd: first.evc,
      duzp: first.dppd,
      ...buckets(rows),
      kod_pred_pl: first.kodPredPl ?? "",
    }
  })

  const b2 = byDoklad(inSection("B2")).map((rows) => {
    const first = rows[0]!
    return {
      dic_dod: first.dic,
      c_evid_dd: first.evc,
      dppd: first.dppd,
      ...buckets(rows),
      pomer: first.pomer ?? "N",
      zdph_44: first.zdph44 ?? "N",
    }
  })

  const aggregate = (section: string) => {
    const rows = inSection(section)
    if (rows.length === 0) return undefined
    const b = buckets(rows)
    return Object.keys(b).length > 0 ? b : undefined
  }

  return {
    header: {
      khdph_forma: forma,
      rok: evidence.rok,
      // KH is monthly for a PO; fall back to the DPH month only when unset.
      mesic: evidence.khMesic ?? evidence.mesic,
    },
    payer: {
      c_ufo: meta.c_ufo,
      dic: meta.dic,
      typ_ds: meta.typ_ds,
      zkrobchjm: meta.nazev,
      naz_obce: meta.naz_obce,
      ulice: meta.ulice,
      c_pop: meta.c_pop,
      psc: meta.psc,
      email: meta.email,
      c_telef: meta.c_telef,
    },
    a1: a1.length > 0 ? a1 : undefined,
    a2: a2.length > 0 ? a2 : undefined,
    a4: a4.length > 0 ? a4 : undefined,
    a5: aggregate("A5"),
    b1: b1.length > 0 ? b1 : undefined,
    b2: b2.length > 0 ? b2 : undefined,
    b3: aggregate("B3"),
  }
}

// ── Souhrnné hlášení ─────────────────────────────────────────────────────────

/** VAT-registration prefixes. Greece registers under EL, Northern Ireland under XI. */
const VAT_PREFIXES = new Set([
  "AT", "BE", "BG", "CY", "CZ", "DE", "DK", "EE", "EL", "ES", "FI", "FR", "GB",
  "HR", "HU", "IE", "IT", "LT", "LU", "LV", "MT", "NL", "PL", "PT", "RO", "SE",
  "SI", "SK", "XI",
]) // prettier-ignore

/** Split a DIČ into (k_stat, c_vat), removing ONLY a recognised country prefix. */
export function splitDic(dic: string): { k_stat: string; c_vat: string } {
  const clean = dic.replace(/[\s.,-]/g, "").toUpperCase()
  const head = clean.slice(0, 2)
  return VAT_PREFIXES.has(head)
    ? { k_stat: head, c_vat: clean.slice(2) }
    : { k_stat: "", c_vat: clean }
}

/**
 * Build the DPHSHV model from the rows that carry a kód plnění.
 *
 * Grouped by (k_stat, c_vat, k_pln_eu) because the schema forbids the same DIČ
 * appearing twice under the same kód, and `pln_pocet` counts DOKLADY, not evidence
 * rows — a doklad split across two sazby is one plnění.
 */
export function projectSouhrnneHlaseni(
  evidence: DphEvidence,
  meta: DphOrgMeta,
  forma = "R",
): DphshvInput {
  const merged = new Map<
    string,
    { k_stat: string; c_vat: string; kod: string; doklady: Set<string>; value: Decimal } // prettier-ignore
  >()

  for (const row of evidence.rows) {
    if (!row.shKod) continue
    const { k_stat, c_vat } = splitDic(row.dic)
    const key = `${k_stat}|${c_vat}|${row.shKod}`
    const entry = merged.get(key)
    if (entry) {
      entry.doklady.add(`${row.evc}|${row.dppd}`)
      entry.value = entry.value.plus(dec(row.zaklad))
    } else {
      merged.set(key, {
        k_stat,
        c_vat,
        kod: row.shKod,
        doklady: new Set([`${row.evc}|${row.dppd}`]),
        value: dec(row.zaklad),
      })
    }
  }

  const rows = [...merged.values()].map((r) => ({
    k_stat: r.k_stat || undefined,
    c_vat: r.c_vat || undefined,
    k_pln_eu: r.kod,
    pln_pocet: String(r.doklady.size),
    pln_hodnota: korunaNahoru(r.value.toString()),
  }))

  return {
    header: {
      shvies_forma: forma,
      rok: evidence.rok,
      mesic: evidence.shMesic ?? evidence.mesic,
      ctvrt:
        evidence.shCtvrt ?? (evidence.shMesic ? undefined : evidence.ctvrt),
    },
    payer: {
      c_ufo: meta.c_ufo,
      dic: meta.dic,
      typ_ds: meta.typ_ds,
      zkrobchjm: meta.nazev,
      naz_obce: meta.naz_obce,
      ulice: meta.ulice,
      c_pop: meta.c_pop,
      psc: meta.psc,
    },
    rows: rows.length > 0 ? rows : undefined,
  }
}

// ── Kontrolní vazby ──────────────────────────────────────────────────────────

export interface DphVazba {
  label: string
  left: string
  right: string
  ok: boolean
}

/**
 * The cross-form checks EPO itself runs. These are the reason all three filings
 * project from one evidence array; if any of them fails, the filings disagree and
 * the plátce gets a výzva.
 */
export function kontrolniVazby(evidence: DphEvidence): DphVazba[] {
  const onLines = (lines: string[]) =>
    sum(
      evidence.rows.filter((r) => lines.includes(r.radek)),
      (r) => r.zaklad,
    )
  const inSections = (sections: string[]) =>
    sum(
      evidence.rows.filter((r) => sections.includes(r.khSekce ?? "")),
      (r) => r.zaklad,
    )

  const mk = (label: string, a: Decimal, b: Decimal): DphVazba => ({
    label,
    left: a.toFixed(2),
    right: b.toFixed(2),
    ok: a.equals(b),
  })

  return [
    mk("KH A.4 + A.5 = přiznání ř. 1 + ř. 2", inSections(["A4", "A5"]), onLines(["1", "2"])), // prettier-ignore
    mk("KH B.2 + B.3 = přiznání ř. 40 + ř. 41", inSections(["B2", "B3"]), onLines(["40", "41"])), // prettier-ignore
    mk("KH A.1 = přiznání ř. 25", inSections(["A1"]), onLines(["25"])),
    mk("SH celkem = přiznání ř. 20 + ř. 21", sum(evidence.rows.filter((r) => !!r.shKod), (r) => r.zaklad), onLines(["20", "21"])), // prettier-ignore
  ]
}
